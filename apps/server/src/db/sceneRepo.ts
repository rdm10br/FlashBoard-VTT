import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export function createScene(sessionId: string, name: string) {
  const id = generateId("scene");
  db.prepare("INSERT INTO scenes (id, session_id, name) VALUES (?, ?, ?)").run(id, sessionId, name);
  return getScene(id)!;
}

export function getScene(id: string) {
  return db.prepare(`
    SELECT s.*, a.kind AS map_asset_kind
    FROM scenes s
    LEFT JOIN assets a ON a.id = s.map_asset_id
    WHERE s.id = ?
  `).get(id) as
    | {
        id: string;
        session_id: string;
        name: string;
        is_visible: number;
        map_asset_id: string | null;
        map_x: number;
        map_y: number;
        map_scale: number;
        map_asset_kind: string | null;
      }
    | undefined;
}

export function getScenesForSession(sessionId: string) {
  return db.prepare(
    `SELECT s.*, a.kind AS map_asset_kind
     FROM scenes s
     LEFT JOIN assets a ON a.id = s.map_asset_id
     WHERE s.session_id = ?
     ORDER BY s.created_at`
  ).all(sessionId) as { id: string; name: string; is_visible: number; created_at: number }[];
}

export function getVisibleScenes(sessionId: string) {
  return db.prepare(
    `SELECT s.*, a.kind AS map_asset_kind
     FROM scenes s
     LEFT JOIN assets a ON a.id = s.map_asset_id
     WHERE s.session_id = ? AND s.is_visible = 1
     ORDER BY s.created_at`
  ).all(sessionId) as { id: string; name: string; is_visible: number }[];
}

export function setSceneVisibility(sceneId: string, visible: boolean) {
  db.prepare("UPDATE scenes SET is_visible = ? WHERE id = ?").run(visible ? 1 : 0, sceneId);
}

export function setSceneMap(
  sceneId: string,
  map: { asset_id: string; x: number; y: number; scale: number } | null,
): void {
  if (!map) {
    db.prepare("UPDATE scenes SET map_asset_id = NULL, map_x = 0, map_y = 0, map_scale = 1 WHERE id = ?")
      .run(sceneId);
    return;
  }
  db.prepare(`
    UPDATE scenes
    SET map_asset_id = ?, map_x = ?, map_y = ?, map_scale = ?
    WHERE id = ?
  `).run(map.asset_id, map.x, map.y, map.scale, sceneId);
}