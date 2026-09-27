import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { getUserByNickname, createUser, getSessionsForUser } from "../db/index.js";
import { send } from "../ws/broadcast.js";

function handlePing(_payload: string, _ctx: HandlerContext) {
  // no-op — mantém paridade com o comportamento anterior (PING nunca foi tratado)
}

function handleUserLogin(payload: { nickname: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const nickname = payload?.nickname;

  if (!nickname || typeof nickname !== "string" || !nickname.trim()) {
    send(ws, { type: "USER_ERROR", payload: { message: "Apelido inválido." } });
    return;
  }

  let user = getUserByNickname(nickname.trim());
  if (!user) user = createUser(nickname.trim());

  state.user_id = user.id;
  state.nickname = user.nickname;

  const sessions = getSessionsForUser(user.id);
  send(ws, {
    type: "USER_STATE",
    payload: { user_id: user.id, nickname: user.nickname, sessions },
  });
}

export const userHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  PING: handlePing,
  USER_LOGIN: handleUserLogin,
};