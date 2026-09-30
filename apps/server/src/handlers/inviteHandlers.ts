import type { ClientMessage, CreateInvitePayload } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { createInviteCode, getInviteCode, deleteInviteCode } from "../db/index.js";
import { toInviteSummary } from "../services/inviteService.js";
import { broadcastToGMs, send } from "../ws/broadcast.js";

const MAX_INVITE_USES = 1000;

function handleInviteCreate(payload: CreateInvitePayload, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  if (!payload || !payload.role) return;

  const { role, max_uses, expires_at } = payload;
  if (role !== "gm" && role !== "player" && role !== "viewer") return;

  if (
    max_uses !== undefined &&
    (!Number.isInteger(max_uses) || max_uses < 1 || max_uses > MAX_INVITE_USES)
  ) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Número de usos inválido." } });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (expires_at !== undefined && (!Number.isInteger(expires_at) || expires_at <= now)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Data de expiração inválida." } });
    return;
  }

  const code = createInviteCode({
    sessionId: state.session_id!,
    role,
    createdBy: state.user_id!,
    maxUses: max_uses,
    expiresAt: expires_at,
  });

  const summary = toInviteSummary(getInviteCode(code));
  if (!summary) return;

  // Só GMs podem ver códigos de convite (inclusive os de role "gm").
  broadcastToGMs(state.session_id!, { type: "INVITE_CREATED", payload: summary });
}

function handleInviteDelete(payload: { code: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.code || typeof payload.code !== "string") return;
  const invite = getInviteCode(payload.code);
  if (!invite || invite.session_id !== state.session_id) return;
  deleteInviteCode(payload.code);
  broadcastToGMs(state.session_id!, { type: "INVITE_DELETED", payload: { code: payload.code } });
}

export const inviteHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  INVITE_CREATE: handleInviteCreate,
  INVITE_DELETE: handleInviteDelete,
};