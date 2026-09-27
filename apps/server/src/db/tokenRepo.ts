import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export function createToken(sceneId: string, x: number, y: number) {
  const id = generateId("token");
  db.prepare("INSERT INTO tokens (id, scene_id, x, y) VALUES (?, ?, ?, ?)").run(id, sceneId, x, y);
  return getToken(id)!;
}

export function getToken(id: string) {
  return db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as
    | { id: string; scene_id: string; x: number; y: number }
    | undefined;
}

export function getTokensForScene(sceneId: string) {
  return db.prepare(
    "SELECT * FROM tokens WHERE scene_id = ? ORDER BY id"
  ).all(sceneId) as { id: string; x: number; y: number; created_at: number }[];
}

export function getTokensForSession(sessionId: string) {
  return db.prepare(
    `SELECT t.x, t.y, t.updated_at AS created_at, s.name AS scene_name
     FROM tokens t
     JOIN scenes s ON s.id = t.scene_id
     WHERE s.session_id = ?
     ORDER BY t.id`
  ).all(sessionId) as { scene_name: string; x: number; y: number; created_at: number }[];
}

export function moveToken(id: string, x: number, y: number) {
  db.prepare(
    "UPDATE tokens SET x = ?, y = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(x, y, id);
}

export function deleteToken(id: string) {
  db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
}