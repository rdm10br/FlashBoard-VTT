import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage } from "@vtt/protocol";
import { getSessionBackup, importSessionBackup, createAsset, getAsset, type SessionBackup } from "./db/index.js";
import { clientRegistry, type ClientState } from "./clientRegistry.js";
import { dispatch } from "./ws/dispatch.js";
import { send } from "./ws/broadcast.js";
import { randomUUID } from "crypto";
import { consumeGrant } from "./state/grants.js";
import multipart from "@fastify/multipart";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { UPLOADS_DIR, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "./storage/uploads.js";

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
    if (request.raw.url?.startsWith("/backup")) {
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

  app.post("/assets/upload", async (request, reply) => {
    const query = request.query as Record<string, string> | undefined;
    const token = query?.token;
    const session_id = query?.session_id;
    const kind = query?.kind;

    if (!token || !session_id || !consumeGrant(token, "asset_upload", session_id)) {
      reply.code(401);
      return { error: "Token de upload inválido, expirado ou já utilizado." };
    }

    if (kind !== "token_image" && kind !== "map_image") {
      reply.code(400);
      return { error: "Tipo de asset inválido." };
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

  app.get("/assets/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = getAsset(id);
    if (!asset) {
      reply.code(404);
      return { error: "Asset não encontrado." };
    }
    const filePath = path.join(UPLOADS_DIR, asset.path);
    reply.type(asset.mime_type);
    return reply.send(fs.createReadStream(filePath));
  });

  app.get("/backup/session/:session_id", async (request, reply) => {
    const session_id = (request.params as { session_id: string }).session_id;
    const token = (request.query as Record<string, string> | undefined)?.token;

    if (!token || !consumeGrant(token, "export", session_id)) {
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

  app.post("/backup/session/import", async (request, reply) => {
    const token = (request.query as Record<string, string> | undefined)?.token;

    if (!token || !consumeGrant(token, "import")) {
      reply.code(401);
      return { error: "Token de importação inválido, expirado ou já utilizado." };
    }

    const body = request.body as SessionBackup & { target_name?: string };
    if (!body || !body.session_name || !body.owner_nickname) {
      reply.code(400);
      return { error: "Backup inválido." };
    }

    const result = importSessionBackup(body, body.target_name);
    return { session_id: result.session.id, session_name: result.session.name, invite_codes: result.invite_codes };
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`HTTP server rodando na porta ${PORT}`);

  const wss = new WebSocketServer({ server: app.server });

  // ─── Heartbeat: detecta conexões zumbi (sem resposta ao ping) ───────────
  const HEARTBEAT_INTERVAL = 25_000;

  const heartbeat = setInterval(() => {
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

  wss.on("connection", (ws: WebSocket) => {
    console.log("Client conectado");

    // Marca como vivo ao conectar e a cada pong recebido
    (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    ws.on("pong", () => { (ws as WebSocket & { isAlive: boolean }).isAlive = true; });

    const state: ClientState = {
      ws,
      user_id: null,
      nickname: "",
      session_id: null,
      role: "player",
      scene_id: null,
    };

    clientRegistry.add(state);
    // send(ws, { type: "CONNECTED" });
    send(ws, { type: "CONNECTED", payload: { boot_id: BOOT_ID } });

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

      try {
        dispatch(data, state, ws);
      } catch (err) {
        console.error("Erro inesperado no dispatch:", err);
      }
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
