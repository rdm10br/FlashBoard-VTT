import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { handleChatCommand } from "../services/chatService.js";
import { send, broadcastToSession, sendToSessionMembers, broadcastToGMs } from "../ws/broadcast.js";

function handleChatSend(payload: { text: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!payload?.text || typeof payload.text !== "string" || !payload.text.trim()) return;
  const session_id = state.session_id!;
  const rawText = payload.text.trim();
  handleChatCommand(
    rawText,
    session_id,
    { nickname: state.nickname, role: state.role },
    ws,
    (m) => send(ws, m),
    (sid, msg) => broadcastToSession(sid, msg),
    (sid, names, msg) => sendToSessionMembers(sid, names, msg),
    (sid, msg) => broadcastToGMs(sid, msg)
  );
}

export const chatHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  CHAT_SEND: handleChatSend,
};