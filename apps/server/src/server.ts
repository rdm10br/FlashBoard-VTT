import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage } from "@vtt/protocol";
import { clientRegistry, type ClientState } from "./clientRegistry.js";
import { dispatch } from "./ws/dispatch.js";
import { send } from "./ws/broadcast.js";
import { isAdminBootstrapAvailable, isAuthSessionActive } from "./services/authService.js";
import { randomUUID } from "crypto";
import { isIP } from "net";
import multipart from "@fastify/multipart";
import { MAX_UPLOAD_BYTES } from "./storage/uploads.js";
import { assetRoutes } from "./http/assetRoutes.js";
import { backupRoutes } from "./http/backupRoutes.js";

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

app.register(assetRoutes);
app.register(backupRoutes);

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
