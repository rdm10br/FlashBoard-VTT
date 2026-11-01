import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { getAsset, getMembersForSession, getScene, getSession, getToken, setTokenOwners } from "../db/index.js";
import { createTokenOnScene, moveTokenOnScene, setTokenAssetOnToken, deleteTokenOnScene } from "../services/gameService.js";
import { broadcastToScene, send } from "../ws/broadcast.js";
import { LIMITS } from "@vtt/protocol";

function isTokenImageFromCurrentSession(assetId: string | undefined, sessionId: string): boolean {
  if (!assetId) return true;
  const asset = getAsset(assetId);
  return asset?.session_id === sessionId && asset.kind === "token_image";
}

const inBounds = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= LIMITS.coordinate;

function handleTokenCreateRequest(payload: { scene_id: string; x: number; y: number; asset_id?: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.scene_id !== "string" || !inBounds(payload.x) || !inBounds(payload.y)) return;
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
  const ownerUserId = state.role === "player" ? state.user_id ?? undefined : undefined;
  const token = createTokenOnScene(payload.scene_id, payload.x, payload.y, assetId, ownerUserId);
  broadcastToScene(payload.scene_id, {
    type: "TOKEN_CREATE",
    payload: { id: token.id, scene_id: payload.scene_id, x: payload.x, y: payload.y, asset_id: token.asset_id, owner_user_id: token.owner_user_id, owner_user_ids: token.owner_user_ids },
  });
}

/** GM pode agir em qualquer token; player só no próprio. */
function canActOnToken(token: { owner_user_ids?: string[]; owner_user_id: string | null }, state: HandlerContext["state"]): boolean {
  if (state.role === "gm") return true;
  return token.owner_user_ids?.includes(state.user_id ?? "") ?? token.owner_user_id === state.user_id;
}

function handleTokenOwnersSet(payload: { token_ids: string[]; owner_user_ids: string[] }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") { send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode alterar os owners." } }); return; }
  const members = getMembersForSession(state.session_id!);
  if (payload.owner_user_ids.some((id) => !members.some((m) => m.id === id && m.role === "player"))) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Owners devem ser jogadores desta sessão." } }); return;
  }
  const tokens = payload.token_ids.map(getToken);
  if (tokens.some((t) => !t || t.scene_id !== state.scene_id || getScene(t.scene_id)?.session_id !== state.session_id)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Seleção contém token de outra cena ou sessão." } }); return;
  }
  const changed = setTokenOwners(payload.token_ids, [...new Set(payload.owner_user_ids)]);
  broadcastToScene(state.scene_id!, { type: "TOKEN_OWNERS_CHANGED", payload: { scene_id: state.scene_id!, tokens: changed } });
}

function handleTokenMove(payload: { id: string; x: number; y: number }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.id !== "string" || !inBounds(payload.x) || !inBounds(payload.y)) return;
  const { id, x, y } = payload;
  const token = getToken(id);
  const scene = token ? getScene(token.scene_id) : undefined;
  if (
    !token ||
    !scene ||
    scene.session_id !== state.session_id ||
    token.scene_id !== state.scene_id
  ) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Token inválido para esta sessão ou cena." } });
    return;
  }
  if (!canActOnToken(token, state)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Você não tem permissão para mover este token." } });
    return;
  }
  moveTokenOnScene(id, x, y);
  broadcastToScene(token.scene_id, { type: "TOKEN_MOVE", payload: { id, x, y } }, ws);
}

export const tokenHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  TOKEN_CREATE_REQUEST: handleTokenCreateRequest,
  TOKEN_MOVE: handleTokenMove,
  TOKEN_SET_ASSET: handleTokenSetAsset,
  TOKEN_DELETE: handleTokenDelete,
  TOKEN_OWNERS_SET: handleTokenOwnersSet,
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
  if (!canActOnToken(token, state)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Você não tem permissão para alterar este token." } });
    return;
  }

  setTokenAssetOnToken(token.id, payload.asset_id);
  broadcastToScene(token.scene_id, { type: "TOKEN_ASSET_CHANGED", payload: { id: token.id, asset_id: payload.asset_id } });
}

function handleTokenDelete(payload: { id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  if (!payload || typeof payload.id !== "string") return;

  const token = getToken(payload.id);
  const scene = token ? getScene(token.scene_id) : undefined;
  if (
    !token ||
    !scene ||
    scene.session_id !== state.session_id ||
    token.scene_id !== state.scene_id
  ) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Token inválido para esta sessão ou cena." } });
    return;
  }

  if (!canActOnToken(token, state)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Você não tem permissão para excluir este token." } });
    return;
  }

  deleteTokenOnScene(token.id);
  broadcastToScene(token.scene_id, { type: "TOKEN_DELETED", payload: { id: token.id } });
}
