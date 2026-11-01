import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { deleteMembership, getAsset, getMembersForSession, getSessionByName, setDefaultTokenAsset, setMembershipRole } from "../db/index.js";
import { broadcastToSession, send, sendSceneState } from "../ws/broadcast.js";
import { clientRegistry } from "../clientRegistry.js";
import { setMemberScene } from "../db/index.js";
import { refreshSceneParty } from "./sceneHandlers.js";
import {
  buildSessionJoinedPayload,
  createSessionForUser,
  enterSession,
  joinSessionByCode,
  resolveActiveSceneId,
} from "../services/sessionService.js";
import { publishPresence } from "../services/presence.js";

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
  publishPresence(session.id);
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

  const activeSceneId = resolveActiveSceneId(session.id, membership.role, membership.current_scene_id ?? session.active_scene_id ?? undefined);
  if (membership.role === "player" && activeSceneId && membership.current_scene_id !== activeSceneId) setMemberScene(session.id, state.user_id!, activeSceneId);
  if (activeSceneId) {
    clientRegistry.setScene(state, activeSceneId);
  }

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname, activeSceneId),
  });

  if (activeSceneId) {
    sendSceneState(ws, activeSceneId, state.user_id!);
  }
  publishPresence(session.id);
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

  const activeSceneId = resolveActiveSceneId(session.id, membership.role, membership.current_scene_id ?? session.active_scene_id ?? undefined);
  if (membership.role === "player" && activeSceneId && membership.current_scene_id !== activeSceneId) setMemberScene(session.id, state.user_id!, activeSceneId);
  if (activeSceneId) {
    clientRegistry.setScene(state, activeSceneId);
  }

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname, activeSceneId),
  });

  if (activeSceneId) {
    sendSceneState(ws, activeSceneId, state.user_id!);
  }
  publishPresence(session.id);
}

function handleSessionSetDefaultTokenAsset(payload: { asset_id: string | null }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode definir a imagem padrão." } });
    return;
  }
  if (!payload || (payload.asset_id !== null && typeof payload.asset_id !== "string")) return;

  if (payload.asset_id !== null) {
    const asset = getAsset(payload.asset_id);
    if (!asset || asset.session_id !== state.session_id || asset.kind !== "token_image") {
      send(ws, { type: "SESSION_ERROR", payload: { message: "Imagem padrão inválida para esta sessão." } });
      return;
    }
  }

  setDefaultTokenAsset(state.session_id!, payload.asset_id);
  broadcastToSession(state.session_id!, { type: "SESSION_DEFAULT_TOKEN_ASSET_CHANGED", payload: { asset_id: payload.asset_id } });
}

export const sessionHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SESSION_CREATE: handleSessionCreate,
  SESSION_JOIN: handleSessionJoin,
  SESSION_ENTER: handleSessionEnter,
  SESSION_LEAVE: (_payload, { state, ws }) => {
    if (!state.session_id) return;
    const sessionId = state.session_id;
    clientRegistry.setSession(state, null);
    state.role = "player";
    refreshSceneParty(sessionId);
    publishPresence(sessionId);
    send(ws, { type: "SESSION_LEFT", payload: {} });
  },
  SESSION_SET_DEFAULT_TOKEN_ASSET: handleSessionSetDefaultTokenAsset,
  SESSION_MEMBERS_REQUEST: (payload: { session_id: string }, { state, ws }) => {
    if (payload.session_id !== state.session_id || state.role !== "gm") return;
    const online = new Set(clientRegistry.inSession(payload.session_id).map((client) => client.user_id).filter((id): id is string => !!id));
    send(ws, { type: "SESSION_MEMBERS", payload: { session_id: payload.session_id, members: getMembersForSession(payload.session_id).map(({ id, nickname, role }) => ({ id, nickname, role, online: online.has(id) })) } });
  },
  SESSION_MEMBER_ROLE_SET: (payload: { user_id: string; role: "gm" | "player" | "viewer" }, { state, ws }) => {
    if (state.role !== "gm" || !payload?.user_id || !["gm", "player", "viewer"].includes(payload.role)) return;
    const sessionId = state.session_id!;
    const members = getMembersForSession(sessionId);
    const target = members.find((member) => member.id === payload.user_id);
    if (!target) return;
    if (target.role === "gm" && payload.role !== "gm" && members.filter((member) => member.role === "gm").length <= 1) {
      send(ws, { type: "SESSION_ERROR", payload: { message: "A sessão precisa manter ao menos um mestre." } });
      return;
    }
    if (target.role === payload.role) return;
    setMembershipRole(sessionId, target.id, payload.role);
    for (const client of [...clientRegistry.inSession(sessionId)]) {
      if (client.user_id !== target.id) continue;
      clientRegistry.setSession(client, null);
      client.role = "player";
      send(client.ws, { type: "SESSION_LEFT", payload: { session_id: sessionId, role: payload.role } });
    }
    sendSessionMembers(sessionId);
  },
  SESSION_MEMBER_REMOVE: (payload: { user_id: string }, { state, ws }) => {
    if (state.role !== "gm" || !payload?.user_id) return;
    const sessionId = state.session_id!;
    const members = getMembersForSession(sessionId);
    const target = members.find((member) => member.id === payload.user_id);
    if (!target) return;
    if (target.role === "gm" && members.filter((member) => member.role === "gm").length <= 1) {
      send(ws, { type: "SESSION_ERROR", payload: { message: "Não é possível remover o último mestre da sessão." } });
      return;
    }
    deleteMembership(sessionId, target.id);
    for (const client of [...clientRegistry.inSession(sessionId)]) {
      if (client.user_id !== target.id) continue;
      clientRegistry.setSession(client, null);
      client.role = "player";
      send(client.ws, { type: "SESSION_LEFT", payload: { session_id: sessionId, removed: true } });
    }
    sendSessionMembers(sessionId);
  },
};

function sendSessionMembers(sessionId: string) {
  const clients = clientRegistry.inSession(sessionId);
  const online = new Set(clients.map((client) => client.user_id).filter((id): id is string => !!id));
  const members = getMembersForSession(sessionId).map(({ id, nickname, role }) => ({ id, nickname, role, online: online.has(id) }));
  for (const client of clients) if (client.role === "gm") send(client.ws, { type: "SESSION_MEMBERS", payload: { session_id: sessionId, members } });
  publishPresence(sessionId);
}
