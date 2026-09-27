import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { SocketManager } from "./network/socket.js";
import { GameController } from "./game/GameController.js";
import type { Role } from "@vtt/protocol";

// --- Socket ---
// Em dev, o client (Vite) roda numa porta diferente do backend, então apontamos
// explicitamente via variável de ambiente. Em produção, client e server são
// servidos pela mesma origem (Fastify), então usamos o host atual dinamicamente.
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = import.meta.env.VITE_WS_URL ?? `${wsProtocol}//${window.location.host}`;
const socket = new SocketManager(wsUrl);
(window as any).__socket = socket;

// --- Jogo (Pixi) ---
const game = new GameController(socket);
await game.init();

// --- React mount ---
const root = createRoot(document.getElementById("app")!);

root.render(
  <StrictMode>
    <App
      socket={socket}
      onSessionJoined={(_session_id, role: Role) => {
        game.setCanCreateTokens(role !== "viewer");
      }}
    />
  </StrictMode>
);