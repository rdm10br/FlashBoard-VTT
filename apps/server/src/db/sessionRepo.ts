import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { Session, Role } from "./types.js";

const SESSION_COLS = "id, name, owner_id, active_scene_id, default_token_asset_id, max_dice_count, max_dice_sides, created_at";

export function getSession(id: string): Session | undefined {
  return db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE id = ?`).get(id) as Session | undefined;
}

export function getSessionByName(name: string): Session | undefined {
  return db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE name = ?`).get(name) as Session | undefined;
}

export function createSession(name: string, ownerId: string, maxDiceCount = 100, maxDiceSides = 100): Session {
  const id = generateId("sess");
  const createdAt = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO sessions (id, name, owner_id, max_dice_count, max_dice_sides, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, name, ownerId, maxDiceCount, maxDiceSides, createdAt);
  return { id, name, owner_id: ownerId, active_scene_id: null, default_token_asset_id: null, max_dice_count: maxDiceCount, max_dice_sides: maxDiceSides, created_at: createdAt };
}

export function updateSessionDiceLimits(id: string, maxDiceCount: number, maxDiceSides: number): void {
  db.prepare("UPDATE sessions SET max_dice_count = ?, max_dice_sides = ? WHERE id = ?").run(maxDiceCount, maxDiceSides, id);
}

/** Persiste a cena ativa da sessão no banco — sobrevive a reinicializações do servidor. */
export function setActiveScene(sessionId: string, sceneId: string): void {
  db.prepare("UPDATE sessions SET active_scene_id = ? WHERE id = ?").run(sceneId, sessionId);
}

export function setDefaultTokenAsset(sessionId: string, assetId: string | null): void {
  db.prepare("UPDATE sessions SET default_token_asset_id = ? WHERE id = ?").run(assetId, sessionId);
}

export function getSessionsForUser(userId: string) {
  return db.prepare(`
    SELECT s.id, s.name, s.owner_id, m.role
    FROM memberships m
    JOIN sessions s ON s.id = m.session_id
    WHERE m.user_id = ?
    ORDER BY m.created_at
  `).all(userId) as { id: string; name: string; owner_id: string; role: Role }[];
}
