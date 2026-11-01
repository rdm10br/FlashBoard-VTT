import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export function createScene(sessionId: string, name: string) {
  const id = generateId("scene");
  const order = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM scenes WHERE session_id = ?").get(sessionId) as { n: number }).n;
  db.prepare("INSERT INTO scenes (id, session_id, name, sort_order) VALUES (?, ?, ?, ?)").run(id, sessionId, name, order);
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
        width: number;
        height: number;
        grid_type: string;
        grid_size: number;
        grid_color: string;
        grid_opacity: number;
        measurement_mode: "grid" | "custom" | "free";
        measurement_unit_label: string;
        measurement_units_per_cell: number;
        measurement_snap_to_cell_centers: number;
      }
    | undefined;
}

export function getScenesForSession(sessionId: string) {
  return db.prepare(
    `SELECT s.*, a.kind AS map_asset_kind
     FROM scenes s
     LEFT JOIN assets a ON a.id = s.map_asset_id
     WHERE s.session_id = ?
     ORDER BY s.sort_order, s.created_at`
  ).all(sessionId) as { id: string; name: string; is_visible: number; sort_order: number; created_at: number }[];
}

export function getVisibleScenes(sessionId: string) {
  return db.prepare(
    `SELECT s.*, a.kind AS map_asset_kind
     FROM scenes s
     LEFT JOIN assets a ON a.id = s.map_asset_id
     WHERE s.session_id = ? AND s.is_visible = 1
     ORDER BY s.sort_order, s.created_at`
  ).all(sessionId) as { id: string; name: string; is_visible: number }[];
}

export function getScenesOccupiedByPlayers(sessionId: string) {
  return db.prepare(`
    SELECT DISTINCT s.id, s.name, s.is_visible, s.sort_order
    FROM scenes s JOIN memberships m ON m.current_scene_id = s.id
    WHERE s.session_id = ? AND s.is_visible = 1 AND m.role = 'player'
    ORDER BY s.sort_order, s.created_at
  `).all(sessionId) as { id: string; name: string; is_visible: number; sort_order: number }[];
}

export function renameScene(sceneId: string, name: string) { db.prepare("UPDATE scenes SET name = ? WHERE id = ?").run(name, sceneId); }

export function reorderScenes(sessionId: string, sceneIds: string[]) {
  const apply = db.transaction(() => sceneIds.forEach((id, index) => db.prepare("UPDATE scenes SET sort_order = ? WHERE id = ? AND session_id = ?").run(index, id, sessionId)));
  apply();
}

export function deleteScene(sceneId: string) { db.prepare("DELETE FROM scenes WHERE id = ?").run(sceneId); }

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

export function setSceneConfig(
  sceneId: string,
  c: { width: number; height: number; grid_type: string; grid_size: number; grid_color: string; grid_opacity: number },
): void {
  db.prepare(`
    UPDATE scenes
    SET width = ?, height = ?, grid_type = ?, grid_size = ?, grid_color = ?, grid_opacity = ?
    WHERE id = ?
  `).run(c.width, c.height, c.grid_type, c.grid_size, c.grid_color, c.grid_opacity, sceneId);
}

export function setSceneMeasurementConfig(
  sceneId: string,
  config: { mode: "grid" | "custom" | "free"; unit_label: string; units_per_cell: number; snap_to_cell_centers: boolean },
): void {
  db.prepare(`
    UPDATE scenes
    SET measurement_mode = ?, measurement_unit_label = ?, measurement_units_per_cell = ?, measurement_snap_to_cell_centers = ?
    WHERE id = ?
  `).run(config.mode, config.unit_label, config.units_per_cell, config.snap_to_cell_centers ? 1 : 0, sceneId);
}
