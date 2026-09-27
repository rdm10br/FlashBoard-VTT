import type { ClientMessage, CreateInvitePayload } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { createInviteCode, getInviteCode, deleteInviteCode } from "../db/index.js";
import { toInviteSummary } from "../services/inviteService.js";
import { broadcastToSession } from "../ws/broadcast.js";

function handleInviteCreate(payload: CreateInvitePayload, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  if (!payload || !payload.role) return;

  const { role, max_uses, expires_at } = payload;
  const code = createInviteCode({
    sessionId: state.session_id!,
    role,
    createdBy: state.user_id!,
    maxUses: max_uses,
    expiresAt: expires_at,
  });

  const summary = toInviteSummary(getInviteCode(code));
  if (!summary) return;

  broadcastToSession(state.session_id!, { type: "INVITE_CREATED", payload: summary });
}

function handleInviteDelete(payload: { code: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.code || typeof payload.code !== "string") return;
  deleteInviteCode(payload.code);
  broadcastToSession(state.session_id!, { type: "INVITE_DELETED", payload: { code: payload.code } });
}

export const inviteHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  INVITE_CREATE: handleInviteCreate,
  INVITE_DELETE: handleInviteDelete,
};