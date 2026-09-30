import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage } from "@vtt/protocol";
import { getSessionBackup, importSessionBackup, createAsset, getAsset, getSession, type SessionBackup } from "./db/index.js";
import { clientRegistry, type ClientState } from "./clientRegistry.js";
import { dispatch } from "./ws/dispatch.js";
import { send } from "./ws/broadcast.js";
import { isAdminBootstrapAvailable, isAuthSessionActive } from "./services/authService.js";
import { randomUUID } from "crypto";
import { isIP } from "net";
import { consumeGrant } from "./state/grants.js";
import multipart from "@fastify/multipart";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { UPLOADS_DIR, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "./storage/uploads.js";
import { BackupValidationError, parseSessionBackup, parseTargetName } from "./services/backupValidation.js";

const app = Fastify();

// Em desenvolvimento o Vite serve o cliente em outra porta (normalmente 5173),
// enquanto a API/WebSocket fica em 3000. Sem este cabeçalho o navegador pode
// concluir o upload no servidor, mas bloquear a resposta para o cliente como
// "Failed to fetch". Em produção cliente e API usam a mesma origem.
app.addHook("onRequest", (request, reply, done) => {
  const origin = request.headers.origin;
  const isLocalVite = origin !== undefined && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

  if (!isLocalVite) {
    done();
    return;
  }

  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") {
    reply.code(204).send();
    return;
  }
  done();
});

app.register(multipart, {
  limits: { fileSize: MAX_UPLOAD_BYTES },
});
const BOOT_ID = randomUUID();

function resolveClientDist(): string | null {
  const candidates = [
    path.join(__dirname, "../../../../client/dist"),
    path.join(__dirname, "../../../client/dist"),
    path.join(process.cwd(), "../client/dist"),
    path.join(process.cwd(), "apps/client/dist"),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) ?? null;
}

const clientDist = resolveClientDist();
if (clientDist) {
  app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? "";
    if (url.startsWith("/backup") || url.startsWith("/api") || url.startsWith("/assets")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const indexPath = path.join(clientDist!, "index.html");
    const html = fs.readFileSync(indexPath, "utf-8");
    reply.type("text/html").send(html);
  });
  console.log(`Servindo client estático de: ${clientDist}`);
} else {
  console.warn("Build do client não encontrado — rode `npm run build` em apps/client.");
}

// app.get("/", async () => ({ status: "ok" }));
app.get("/health", async () => ({ status: "ok" }));

const start = async () => {
  const PORT = 3000;

  app.post("/api/assets/upload", async (request, reply) => {
    const query = request.query as Record<string, string> | undefined;
    const token = query?.token;
    const session_id = query?.session_id;
    const kind = query?.kind;

    if (kind !== "token_image" && kind !== "map_image") {
      reply.code(400);
      return { error: "Tipo de asset inválido." };
    }

    const grant =
      token && session_id
        ? consumeGrant(token, "asset_upload", session_id, kind)
        : undefined;
    if (!grant || !session_id) {
      reply.code(401);
      return { error: "Token de upload inválido, expirado ou já utilizado." };
    }

    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Nenhum arquivo enviado." };
    }

    const extension = ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      reply.code(415);
      return { error: `Tipo de arquivo não permitido: ${file.mimetype}` };
    }

    const diskName = `${randomUUID()}${extension}`;
    const diskPath = path.join(UPLOADS_DIR, diskName);

    try {
      await pipeline(file.file, createWriteStream(diskPath));
    } catch {
      await fs.promises.unlink(diskPath).catch(() => {});
      reply.code(500);
      return { error: "Falha ao salvar o arquivo." };
    }

    // @fastify/multipart trunca o stream ao atingir o limite configurado no plugin;
    // essa flag indica que o arquivo era maior do que o permitido.
    if (file.file.truncated) {
      await fs.promises.unlink(diskPath).catch(() => {});
      reply.code(413);
      return { error: `Arquivo excede o limite de ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` };
    }

    const stats = await fs.promises.stat(diskPath);

    const asset = createAsset({
      sessionId: session_id,
      kind,
      filename: file.filename,
      path: diskName,
      mimeType: file.mimetype,
      sizeBytes: stats.size,
    });

    return { id: asset.id, filename: asset.filename, size_bytes: asset.size_bytes };
  });

  app.get("/api/assets/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const key = (request.query as Record<string, string> | undefined)?.key;

    const asset = getAsset(id);
    if (!asset) {
      reply.code(404);
      return { error: "Asset não encontrado." };
    }

    // const session = getSession(asset.session_id);
    // if (!session || !key || key !== session.asset_key) {
    //   reply.code(401);
    //   return { error: "Acesso não autorizado a este asset." };
    // }

    const filePath = path.join(UPLOADS_DIR, asset.path);
    reply.type(asset.mime_type);
    return reply.send(fs.createReadStream(filePath));
  });

  app.get("/backup/session/:session_id", async (request, reply) => {
    const session_id = (request.params as { session_id: string }).session_id;
    const token = (request.query as Record<string, string> | undefined)?.token;

    const grant = token ? consumeGrant(token, "export", session_id) : undefined;
    if (!grant) {
      reply.code(401);
      return { error: "Token de exportação inválido, expirado ou já utilizado." };
    }

    const backup = getSessionBackup(session_id);
    if (!backup) {
      reply.code(404);
      return { error: "Sessão não encontrada." };
    }

    const safeName = backup.session_name.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = `vtt-backup-${safeName}-${Date.now()}.json`;

    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.type("application/json");
    return backup;
  });

  app.post("/backup/session/import", { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const token = (request.query as Record<string, string> | undefined)?.token;

    const grant = token ? consumeGrant(token, "import") : undefined;
    if (!grant) {
      reply.code(401);
      return { error: "Token de importação inválido, expirado ou já utilizado." };
    }

    let backup: SessionBackup;
    let targetName: string | undefined;
    try {
      backup = parseSessionBackup(request.body);
      targetName = parseTargetName(request.body);
    } catch (error) {
      if (error instanceof BackupValidationError) {
        reply.code(400);
        return { error: error.message };
      }
      throw error;
    }

    const result = importSessionBackup(backup, targetName, grant.user_id);
    return { session_id: result.session.id, session_name: result.session.name, invite_codes: result.invite_codes };
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`HTTP server rodando na porta ${PORT}`);

  const wss = new WebSocketServer({ server: app.server });

  // ─── Heartbeat: detecta conexões zumbi (sem resposta ao ping) ───────────
  const HEARTBEAT_INTERVAL = 25_000;

  const heartbeat = setInterval(() => {
    for (const state of clientRegistry.allClients()) {
      if (state.user_id && state.auth_token && !isAuthSessionActive(state.user_id, state.auth_token)) {
        clientRegistry.clearAuthentication(state);
        send(state.ws, { type: "USER_LOGGED_OUT", payload: {} });
      }
    }

    wss.clients.forEach((ws) => {
      const client = ws as WebSocket & { isAlive?: boolean };
      if (client.isAlive === false) {
        console.warn("Encerrando conexão zumbi (sem pong).");
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws: WebSocket, request) => {
    console.log("Client conectado");

    // Marca como vivo ao conectar e a cada pong recebido
    (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    ws.on("pong", () => { (ws as WebSocket & { isAlive: boolean }).isAlive = true; });

    const cloudflareClientIp = request.headers["cf-connecting-ip"];
    const trustedClientIp =
      process.env.TRUST_PROXY_HEADERS === "true" &&
      typeof cloudflareClientIp === "string" &&
      isIP(cloudflareClientIp)
        ? cloudflareClientIp
        : undefined;

    const state: ClientState = {
      ws,
      user_id: null,
      nickname: "",
      auth_token: null,
      auth_client_key: trustedClientIp ?? request.socket.remoteAddress ?? "unknown",
      is_admin: false,
      session_id: null,
      role: "player",
      scene_id: null,
    };

    clientRegistry.add(state);
    // send(ws, { type: "CONNECTED" });
    send(ws, {
      type: "CONNECTED",
      payload: { boot_id: BOOT_ID, admin_bootstrap_available: isAdminBootstrapAvailable() },
    });

    ws.on("message", (raw) => {
      const text = raw.toString();
      let data: ClientMessage;

      try {
        data = JSON.parse(text) as ClientMessage;
      } catch {
        console.warn("Mensagem inválida recebida (JSON inválido), ignorando.");
        return;
      }

      if (!data || typeof data !== "object" || typeof data.type !== "string") {
        console.warn("Mensagem sem formato esperado (type ausente), ignorando.");
        return;
      }

      void dispatch(data, state, ws).catch((err) => {
        console.error("Erro inesperado no dispatch:", err);
        send(ws, { type: "USER_ERROR", payload: { message: "Erro interno ao processar a mensagem." } });
      });
    });

    ws.on("close", () => {
      clientRegistry.remove(state);
      console.log("Client desconectado");
    });

    ws.on("error", (err) => {
      console.error("Erro no WebSocket:", err);
    });
  });
};

start().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
