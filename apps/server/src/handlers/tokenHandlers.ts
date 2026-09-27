import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { getAsset, getScene, getSession, getToken } from "../db/index.js";
import { createTokenOnScene, moveTokenOnScene, setTokenAssetOnToken } from "../services/gameService.js";
import { broadcastToScene, send } from "../ws/broadcast.js";

function isTokenImageFromCurrentSession(assetId: string | undefined, sessionId: string): boolean {
  if (!assetId) return true;
  const asset = getAsset(assetId);
  return asset?.session_id === sessionId && asset.kind === "token_image";
}

function handleTokenCreateRequest(payload: { scene_id: string; x: number; y: number; asset_id?: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.scene_id !== "string" || typeof payload.x !== "number" || typeof payload.y !== "number") return;
  const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Cena inválida para criar token." } });
    return;
  }
  const defaultAssetId = getSession(state.session_id!)?.default_token_asset_id ?? undefined;
  const assetId = payload.asset_id ?? defaultAssetId;
  if (!isTokenImageFromCurrentSession(assetId, state.session_id!)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Imagem de token inválida para esta sessão." } });
    return;
  }
  const token = createTokenOnScene(payload.scene_id, payload.x, payload.y, assetId);
  broadcastToScene(payload.scene_id, {
    type: "TOKEN_CREATE",
    payload: { id: token.id, scene_id: payload.scene_id, x: payload.x, y: payload.y, asset_id: token.asset_id },
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
  TOKEN_SET_ASSET: handleTokenSetAsset,
};

function handleTokenSetAsset(payload: { id: string; asset_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.id !== "string" || typeof payload.asset_id !== "string") return;

  const token = getToken(payload.id);
  const scene = token ? getScene(token.scene_id) : undefined;
  if (!token || !scene || scene.session_id !== state.session_id || token.scene_id !== state.scene_id || !isTokenImageFromCurrentSession(payload.asset_id, state.session_id!)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Token ou imagem inválidos para esta sessão." } });
    return;
  }

  setTokenAssetOnToken(token.id, payload.asset_id);
  broadcastToScene(token.scene_id, { type: "TOKEN_ASSET_CHANGED", payload: { id: token.id, asset_id: payload.asset_id } });
}
