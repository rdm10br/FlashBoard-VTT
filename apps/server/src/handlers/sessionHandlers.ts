import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { getSessionByName } from "../db/index.js";
import { send, sendSceneState } from "../ws/broadcast.js";
import { clientRegistry } from "../clientRegistry.js";
import { activeScenesPerSession } from "../state/activeScenes";
import {
  buildSessionJoinedPayload,
  createSessionForUser,
  enterSession,
  joinSessionByCode,
  resolveActiveSceneId,
} from "../services/sessionService.js";

function handleSessionCreate(payload: { name: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const name = payload?.name;

  if (!name || typeof name !== "string" || !name.trim()) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Nome de sessão inválido." } });
    return;
  }

  if (getSessionByName(name.trim())) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Já existe uma sessão com esse nome." } });
    return;
  }

  const { session, membership } = createSessionForUser(state.user_id!, state.nickname, name.trim());
  clientRegistry.setSession(state, session.id);
  state.role = "gm";

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname),
  });
}

function handleSessionJoin(payload: { code: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!payload?.code || typeof payload.code !== "string" || !payload.code.trim()) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Código de convite inválido." } });
    return;
  }

  const result = joinSessionByCode(state.user_id!, payload.code.trim(), state.nickname);

  if ("error" in result) {
    send(ws, { type: "SESSION_ERROR", payload: { message: result.error } });
    return;
  }

  const { session, membership } = result.result;
  clientRegistry.setSession(state, session.id);
  state.role = membership.role;

  const activeSceneId = resolveActiveSceneId(session.id, membership.role, activeScenesPerSession.get(session.id));
  if (activeSceneId) {
    clientRegistry.setScene(state, activeSceneId);
  }

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname, activeScenesPerSession.get(session.id)),
  });

  if (activeSceneId) {
    sendSceneState(ws, activeSceneId);
  }
}

function handleSessionEnter(payload: { session_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!payload?.session_id || typeof payload.session_id !== "string" || !payload.session_id.trim()) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "ID de sessão inválido." } });
    return;
  }

  const result = enterSession(state.user_id!, payload.session_id.trim(), state.nickname);

  if ("error" in result) {
    send(ws, { type: "SESSION_ERROR", payload: { message: result.error } });
    return;
  }

  const { session, membership } = result.result;
  clientRegistry.setSession(state, session.id);
  state.role = membership.role;

  const activeSceneId = resolveActiveSceneId(session.id, membership.role, activeScenesPerSession.get(session.id));
  if (activeSceneId) {
    clientRegistry.setScene(state, activeSceneId);
  }

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname, activeScenesPerSession.get(session.id)),
  });

  if (activeSceneId) {
    sendSceneState(ws, activeSceneId);
  }
}

export const sessionHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SESSION_CREATE: handleSessionCreate,
  SESSION_JOIN: handleSessionJoin,
  SESSION_ENTER: handleSessionEnter,
};