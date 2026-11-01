import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { Membership, Role } from "./types.js";

export function getMembership(userId: string, sessionId: string): Membership | undefined {
  return db.prepare(
    "SELECT * FROM memberships WHERE user_id = ? AND session_id = ?"
  ).get(userId, sessionId) as Membership | undefined;
}

export function createMembership(userId: string, sessionId: string, role: Role): Membership {
  const id = generateId("memb");
  db.prepare(
    "INSERT INTO memberships (id, user_id, session_id, role) VALUES (?, ?, ?, ?)"
  ).run(id, userId, sessionId, role);
  return { id, user_id: userId, session_id: sessionId, role };
}

export function getMembersForSession(sessionId: string) {
  return db.prepare(`
    SELECT u.id, u.nickname, m.role, m.created_at, m.current_scene_id
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.session_id = ?
    ORDER BY m.created_at
  `).all(sessionId) as { id: string; nickname: string; role: Role; created_at: number; current_scene_id: string | null }[];
}

export function setMemberScene(sessionId: string, userId: string, sceneId: string | null) {
  db.prepare("UPDATE memberships SET current_scene_id = ? WHERE session_id = ? AND user_id = ? AND role = 'player'").run(sceneId, sessionId, userId);
}

export function setMembershipRole(sessionId: string, userId: string, role: Role) {
  db.prepare("UPDATE memberships SET role = ? WHERE session_id = ? AND user_id = ?").run(role, sessionId, userId);
}

export function deleteMembership(sessionId: string, userId: string) {
  db.prepare("DELETE FROM memberships WHERE session_id = ? AND user_id = ?").run(sessionId, userId);
}

export function setMembersScene(sessionId: string, userIds: string[], sceneId: string) {
  const apply = db.transaction(() => {
    const update = db.prepare("UPDATE memberships SET current_scene_id = ? WHERE session_id = ? AND user_id = ? AND role = 'player'");
    for (const id of userIds) update.run(sceneId, sessionId, id);
  });
  apply();
}
