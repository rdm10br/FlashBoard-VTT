import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { createTokenOnScene, moveTokenOnScene } from "../services/gameService.js";
import { broadcastToScene } from "../ws/broadcast.js";

function handleTokenCreateRequest(payload: { scene_id: string; x: number; y: number }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.scene_id !== "string" || typeof payload.x !== "number" || typeof payload.y !== "number") return;
  const token = createTokenOnScene(payload.scene_id, payload.x, payload.y);
  broadcastToScene(payload.scene_id, {
    type: "TOKEN_CREATE",
    payload: { id: token.id, scene_id: payload.scene_id, x: payload.x, y: payload.y },
  });
}

function handleTokenMove(payload: { id: string; x: number; y: number }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.id !== "string" || typeof payload.x !== "number" || typeof payload.y !== "number") return;
  const { id, x, y } = payload;
  moveTokenOnScene(id, x, y);
  if (state.scene_id) {
    broadcastToScene(state.scene_id, { type: "TOKEN_MOVE", payload: { id, x, y } }, ws);
  }
}

export const tokenHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  TOKEN_CREATE_REQUEST: handleTokenCreateRequest,
  TOKEN_MOVE: handleTokenMove,
};