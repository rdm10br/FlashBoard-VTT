import db from "./connection.js";
import type { SessionBackup } from "./types.js";
import { getSession, getSessionByName, createSession } from "./sessionRepo.js";
import { getUserById } from "./userRepo.js";
import { createMembership, getMembersForSession } from "./membershipRepo.js";
import { createInviteCode, getInviteCodesForSession, setInviteUseCount } from "./inviteRepo.js";
import { createScene, getScenesForSession, setSceneVisibility } from "./sceneRepo.js";
import { createToken, getTokensForSession } from "./tokenRepo.js";
import { createChatMessage } from "./chatRepo.js";

type ChatRow = {
  sender: string;
  text: string;
  timestamp: number;
  message_type: SessionBackup["chat_messages"][number]["message_type"];
  target: string | null;
  metadata: string | null;
  created_at: number;
};

function parseMetadata(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function getSessionBackup(sessionId: string): SessionBackup | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;

  const owner = getUserById(session.owner_id);
  if (!owner) return undefined;

  const scenes = getScenesForSession(sessionId);
  const sceneIndexById = new Map(scenes.map((scene, index) => [scene.id, index]));

  const chatRows = db.prepare(
    `SELECT sender, text, timestamp, message_type, target, metadata, created_at
     FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC, rowid ASC`
  ).all(sessionId) as ChatRow[];

  return {
    version: 2,
    session_name: session.name,
    owner_nickname: owner.nickname,
    max_dice_count: session.max_dice_count ?? 100,
    max_dice_sides: session.max_dice_sides ?? 100,
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
    scenes: scenes.map((scene) => ({
      name: scene.name,
      is_visible: scene.is_visible === 1,
      created_at: scene.created_at,
    })),
    tokens: getTokensForSession(sessionId).flatMap((token) => {
      const sceneIndex = sceneIndexById.get(token.scene_id);
      return sceneIndex === undefined
        ? []
        : [{ scene_index: sceneIndex, x: token.x, y: token.y, created_at: token.created_at }];
    }),
    chat_messages: chatRows.map((row) => ({
      sender: row.sender,
      text: row.text,
      timestamp: row.timestamp,
      created_at: row.created_at,
      message_type: row.message_type,
      target: row.target ?? undefined,
      metadata: parseMetadata(row.metadata),
    })),
    created_at: session.created_at,
  };
}

// `backup` já vem validado por parseSessionBackup.
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
    const session = createSession(name, owner.id, backup.max_dice_count, backup.max_dice_sides);
    createMembership(owner.id, session.id, "gm");

    // Membros não são recriados: quem importa vira GM e os demais entram por convite.
    // Assim o import nunca cria contas nem vincula terceiros à sessão.

    const sceneIds: string[] = [];
    for (const scene of backup.scenes) {
      const created = createScene(session.id, scene.name);
      if (scene.is_visible) setSceneVisibility(created.id, true);
      sceneIds.push(created.id);
    }

    for (const token of backup.tokens) {
      const sceneId = sceneIds[token.scene_index];
      if (!sceneId) continue;
      createToken(sceneId, token.x, token.y);
    }

    for (const message of backup.chat_messages) {
      createChatMessage(
        session.id,
        message.sender,
        message.text,
        message.timestamp,
        message.message_type,
        message.target,
        message.metadata,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const codes: string[] = [];
    for (const invite of backup.invite_codes) {
      if (invite.expires_at !== null && invite.expires_at < now) continue;
      const code = createInviteCode({
        sessionId: session.id,
        role: invite.role,
        createdBy: owner.id,
        maxUses: invite.max_uses ?? undefined,
        expiresAt: invite.expires_at ?? undefined,
      });
      if (invite.use_count > 0) setInviteUseCount(code, invite.use_count);
      codes.push(code);
    }

    return { session, invite_codes: codes };
  })();
}