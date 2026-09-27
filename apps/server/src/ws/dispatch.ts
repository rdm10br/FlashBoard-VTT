import type { WebSocket } from "ws";
import type { ClientMessage } from "@vtt/protocol";
import { clientRegistry, type ClientState } from "../clientRegistry.js";
import type { MessageHandler } from "../handlers/types.js";
import { userHandlers } from "../handlers/userHandlers.js";
import { sessionHandlers } from "../handlers/sessionHandlers.js";
import { inviteHandlers } from "../handlers/inviteHandlers.js";
import { chatHandlers } from "../handlers/chatHandlers.js";
import { sceneHandlers } from "../handlers/sceneHandlers.js";
import { tokenHandlers } from "../handlers/tokenHandlers.js";
import { backupHandlers } from "../handlers/backupHandlers.js";
import { assetHandlers } from "../handlers/assetHandlers.js";

import { send } from "./broadcast.js";
import { isAuthSessionActive } from "../services/authService.js";

const handlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  ...userHandlers,
  ...sessionHandlers,
  ...inviteHandlers,
  ...chatHandlers,
  ...sceneHandlers,
  ...tokenHandlers,
  ...backupHandlers,
  ...assetHandlers
};

// Tipos que exigem login e/ou sessão ativa
const REQUIRES_LOGIN = new Set<ClientMessage["type"]>([
  "USER_LOGOUT", "ADMIN_LIST_USERS", "ADMIN_SET_USER_CREDENTIALS",
  "SESSION_CREATE", "SESSION_JOIN", "SESSION_ENTER", "SESSION_SET_DEFAULT_TOKEN_ASSET",
  "INVITE_CREATE", "INVITE_DELETE", "CHAT_SEND",
  "SCENE_CREATE", "SCENE_SWITCH", "SCENE_PUSH", "SCENE_SET_VISIBLE",
  "SCENE_MAP_SET",
  "TOKEN_CREATE_REQUEST", "TOKEN_MOVE", "TOKEN_SET_ASSET",
  "BACKUP_EXPORT_REQUEST", "BACKUP_IMPORT_GRANT_REQUEST",
  "ASSET_UPLOAD_GRANT_REQUEST"
]);

const REQUIRES_SESSION = new Set<ClientMessage["type"]>([
  "INVITE_CREATE", "INVITE_DELETE", "CHAT_SEND",
  "SESSION_SET_DEFAULT_TOKEN_ASSET",
  "SCENE_CREATE", "SCENE_SWITCH", "SCENE_PUSH", "SCENE_SET_VISIBLE",
  "SCENE_MAP_SET",
  "TOKEN_CREATE_REQUEST", "TOKEN_MOVE", "TOKEN_SET_ASSET",
  "BACKUP_EXPORT_REQUEST",
  "ASSET_UPLOAD_GRANT_REQUEST"
]);

export async function dispatch(data: ClientMessage, state: ClientState, ws: WebSocket) {
  console.log("Mensagem recebida:", data.type);

  if (
    state.user_id &&
    state.auth_token &&
    !isAuthSessionActive(state.user_id, state.auth_token)
  ) {
    clientRegistry.clearAuthentication(state);
    send(ws, { type: "USER_LOGGED_OUT", payload: {} });
    return;
  }

  if (REQUIRES_LOGIN.has(data.type) && !state.user_id) {
    console.warn("Mensagem sem login, ignorando.");
    send(ws, { type: "USER_ERROR", payload: { message: "Você precisa estar conectado para realizar esta ação." } });
    return;
  }

  if (REQUIRES_SESSION.has(data.type) && !state.session_id) {
    console.warn("Mensagem sem sessão ativa, ignorando.");
    send(ws, { type: "SESSION_ERROR", payload: { message: "Nenhuma sessão ativa selecionada." } });
    return;
  }

  const handler = handlers[data.type];
  if (!handler) {
    console.warn("Tipo de mensagem sem handler registrado:", data.type);
    return;
  }

  try {
    await handler((data as any).payload, { state, ws });
  } catch (err) {
    console.error(`Erro ao executar handler de [${data.type}]:`, err);
    send(ws, {
      type: "USER_ERROR",
      payload: { message: `Erro interno ao processar ${data.type}.` },
    });
  }
}
