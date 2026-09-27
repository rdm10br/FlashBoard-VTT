import db from "./connection.js";
import type { SessionBackup } from "./types.js";
import { getSession, getSessionByName, createSession } from "./sessionRepo.js";
import { getUserById, getUserByNickname, getOrCreateUserByNickname, createUser, hasUserCredentials } from "./userRepo.js";
import { createMembership, getMembersForSession } from "./membershipRepo.js";
import { createInviteCode, getInviteCodesForSession, setInviteUseCount } from "./inviteRepo.js";
import { createScene, getScenesForSession, setSceneVisibility } from "./sceneRepo.js";
import { createToken, getTokensForSession } from "./tokenRepo.js";
import { createChatMessage } from "./chatRepo.js";

export function getSessionBackup(sessionId: string) {
  const session = getSession(sessionId);
  if (!session) return undefined;

  const owner = getUserById(session.owner_id);
  if (!owner) return undefined;

  return {
    session_name: session.name,
    owner_nickname: owner.nickname,
    members: getMembersForSession(sessionId).map((m) => ({
      nickname: m.nickname,
      role: m.role,
      created_at: m.created_at,
    })),
    invite_codes: getInviteCodesForSession(sessionId).map((inv) => ({
      role: inv.role,
      use_count: inv.use_count,
      max_uses: inv.max_uses,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
    })),
    scenes: getScenesForSession(sessionId).map((scene) => ({
      name: scene.name,
      is_visible: scene.is_visible === 1,
      created_at: scene.created_at,
    })),
    tokens: getTokensForSession(sessionId),
    chat_messages: db.prepare(
      "SELECT sender, text, timestamp, created_at FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(sessionId) as { sender: string; text: string; timestamp: number; created_at: number }[],
    created_at: session.created_at,
  };
}

export function importSessionBackup(backup: SessionBackup, targetName: string | undefined, importerId: string) {
  return db.transaction(() => {
    const baseName = (targetName?.trim() || backup.session_name).trim();
    let name = baseName;
    let suffix = 1;
    while (getSessionByName(name)) {
      name = `${baseName}-${suffix}`;
      suffix += 1;
    }

    const owner = getUserById(importerId);
    if (!owner) throw new Error("A conta que solicitou a importação não existe.");
    const session = createSession(name, owner.id);
    createMembership(owner.id, session.id, "gm");

    for (const member of backup.members) {
      if (member.nickname.toLowerCase() === backup.owner_nickname.toLowerCase()) continue;
      const existing = getUserByNickname(member.nickname);
      if (existing && hasUserCredentials(existing.id)) continue;
      const user = existing ?? createUser(member.nickname);
      if (user.id !== owner.id) createMembership(user.id, session.id, member.role);
    }

    const sceneIds = new Map<string, string>();
    for (const scene of backup.scenes) {
      const created = createScene(session.id, scene.name);
      if (scene.is_visible) setSceneVisibility(created.id, true);
      sceneIds.set(scene.name, created.id);
    }

    for (const token of backup.tokens) {
      const sceneId = sceneIds.get(token.scene_name);
      if (!sceneId) continue;
      createToken(sceneId, token.x, token.y);
    }

    for (const message of backup.chat_messages) {
      getOrCreateUserByNickname(message.sender);
      createChatMessage(session.id, message.sender, message.text, message.timestamp);
    }

    const codes: string[] = [];
    for (const invite of backup.invite_codes) {
      const code = createInviteCode({
        sessionId: session.id,
        role: invite.role,
        createdBy: owner.id,
        maxUses: invite.max_uses ?? undefined,
        expiresAt: invite.expires_at ?? undefined,
      });
      if (invite.use_count > 0) {
        setInviteUseCount(code, invite.use_count);
      }
      codes.push(code);
    }

    return { session, invite_codes: codes };
  })();
}