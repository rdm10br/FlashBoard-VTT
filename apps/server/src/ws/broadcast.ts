import { WebSocket } from "ws";
import type { ServerMessage } from "@vtt/protocol";
import { clientRegistry } from "../clientRegistry.js";
import { getSceneState } from "../services/gameService.js";

export function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error("Falha ao enviar mensagem WebSocket:", err);
    }
  }
}

export function sendSceneState(ws: WebSocket, scene_id: string) {
  const sceneState = getSceneState(scene_id);
  send(ws, { type: "SCENE_STATE", payload: sceneState });
}

// --- Broadcasts (O(tamanho da sala/cena), não O(clients do servidor)) ---

export function broadcastToScene(scene_id: string, msg: ServerMessage, exclude?: WebSocket) {
  for (const client of clientRegistry.inScene(scene_id)) {
    if (client.ws !== exclude) send(client.ws, msg);
  }
}

export function broadcastToSession(session_id: string, msg: ServerMessage, exclude?: WebSocket) {
  for (const client of clientRegistry.inSession(session_id)) {
    if (client.ws !== exclude) send(client.ws, msg);
  }
}

export function sendToSessionMembers(session_id: string, nicknames: string[], msg: ServerMessage) {
  for (const client of clientRegistry.inSession(session_id)) {
    if (nicknames.includes(client.nickname)) send(client.ws, msg);
  }
}

export function broadcastToGMs(session_id: string, msg: ServerMessage) {
  for (const client of clientRegistry.inSession(session_id)) {
    if (client.role === "gm") send(client.ws, msg);
  }
}