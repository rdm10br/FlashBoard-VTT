import type { InviteCodeSummary, Role, SessionJoinedPayload } from "@vtt/protocol";
import db from "../db/connection.js";
import type { Membership, Session } from "../db/index.js";
import {
  createMembership,
  createSession,
  getChatMessagesForSession,
  getInviteCode,
  getInviteCodesForSession,
  getMembership,
  getSession,
  getVisibleScenes,
  getScenesForSession,
  useInviteCode,
} from "../db/index.js";
import { toInviteSummary } from "./inviteService.js";

export type SessionJoinResult = {
  session: Session;
  membership: Membership;
};

export type SessionJoinOutcome =
  | { error: string }
  | { result: SessionJoinResult };

// function toInviteSummary(inv: InviteCode | undefined): InviteCodeSummary | null {
//   if (!inv) return null;
//   return {
//     code: inv.code,
//     role: inv.role,
//     use_count: inv.use_count,
//     max_uses: inv.max_uses,
//     expires_at: inv.expires_at,
//     created_at: inv.created_at,
//   };
// }

function resolveScenes(sessionId: string, role: Role) {
  return role === "gm" ? getScenesForSession(sessionId) : getVisibleScenes(sessionId);
}

export function resolveActiveSceneId(sessionId: string, role: Role, activeSceneId?: string) {
  const scenes = resolveScenes(sessionId, role);
  if (activeSceneId && scenes.some((scene) => scene.id === activeSceneId)) {
    return activeSceneId;
  }
  return scenes[0]?.id;
}

export function buildSessionJoinedPayload(
  session: Session,
  membership: Membership,
  nickname: string,
  activeSceneId?: string
): SessionJoinedPayload {
  const scenes = resolveScenes(session.id, membership.role);
  const rawInviteCodes = membership.role === "gm" ? getInviteCodesForSession(session.id) : [];

  const sceneList = scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    is_visible: scene.is_visible === 1,
  }));

  const active_scene_id = activeSceneId && sceneList.some((scene) => scene.id === activeSceneId)
    ? activeSceneId
    : "";

  return {
    session_id: session.id,
    session_name: session.name,
    member: { id: membership.id, nickname, role: membership.role },
    invite_codes: rawInviteCodes
      .map(toInviteSummary)
      .filter((item): item is InviteCodeSummary => item !== null),
    // asset_key: session.asset_key,
    scenes: sceneList,
    active_scene_id,
    default_token_asset_id: session.default_token_asset_id,
    chat: getChatMessagesForSession(session.id, membership.role, nickname),
  };
}

export function createSessionForUser(
  userId: string,
  nickname: string,
  name: string
): SessionJoinResult {
  return db.transaction(() => {
    const session = createSession(name, userId);
    const membership = createMembership(userId, session.id, "gm");
    return { session, membership };
  })();
}

export function joinSessionByCode(
  userId: string,
  code: string,
  nickname: string
): SessionJoinOutcome {
  const invite = getInviteCode(code.toUpperCase());
  if (!invite) {
    return { error: "Código de convite inválido." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (invite.expires_at && invite.expires_at < now) {
    return { error: "Código de convite expirado." };
  }

  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    return { error: "Código de convite esgotado." };
  }

  const session = getSession(invite.session_id);
  if (!session) {
    return { error: "Sessão não encontrada." };
  }

  const existing = getMembership(userId, session.id);
  const membership = existing ?? createMembership(userId, session.id, invite.role);
  if (!existing) {
    useInviteCode(code.toUpperCase());
  }

  return { result: { session, membership } };
}

export function enterSession(
  userId: string,
  sessionId: string,
  nickname: string
): SessionJoinOutcome {
  const membership = getMembership(userId, sessionId);
  if (!membership) {
    return { error: "Você não é membro dessa sessão." };
  }

  const session = getSession(sessionId);
  if (!session) {
    return { error: "Sessão não encontrada." };
  }

  return { result: { session, membership } };
}
