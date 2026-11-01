import type { SceneDrawing, SceneDrawingKind } from "@vtt/protocol";
import db from "./connection.js";
import { generateId } from "./idGenerators.js";

type DrawingRow = {
  id: string;
  scene_id: string;
  owner_user_id: string;
  kind: SceneDrawingKind;
  points: string;
  shared: number;
};

function toDrawing(row: DrawingRow): SceneDrawing {
  return {
    id: row.id,
    scene_id: row.scene_id,
    owner_user_id: row.owner_user_id,
    kind: row.kind,
    points: JSON.parse(row.points) as number[],
    shared: row.shared === 1,
    persistent: true,
  };
}

export function listSceneDrawings(sceneId: string, userId: string): SceneDrawing[] {
  const rows = db.prepare(`
    SELECT * FROM scene_drawings
    WHERE scene_id = ? AND (kind != 'measurement' OR shared = 1 OR owner_user_id = ?)
    ORDER BY created_at, id
  `).all(sceneId, userId) as DrawingRow[];
  return rows.map(toDrawing);
}

export function createSceneDrawing(input: {
  scene_id: string;
  owner_user_id: string;
  kind: SceneDrawingKind;
  points: number[];
  shared: boolean;
}): SceneDrawing {
  const id = generateId("draw");
  db.prepare(`
    INSERT INTO scene_drawings (id, scene_id, owner_user_id, kind, points, shared)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.scene_id, input.owner_user_id, input.kind, JSON.stringify(input.points), input.shared ? 1 : 0);
  return {
    id,
    scene_id: input.scene_id,
    owner_user_id: input.owner_user_id,
    kind: input.kind,
    points: input.points,
    shared: input.shared,
    persistent: true,
  };
}

export function getSceneDrawing(id: string): SceneDrawing | undefined {
  const row = db.prepare("SELECT * FROM scene_drawings WHERE id = ?").get(id) as DrawingRow | undefined;
  return row ? toDrawing(row) : undefined;
}

export function moveSceneDrawing(id: string, points: number[]): void {
  db.prepare("UPDATE scene_drawings SET points = ? WHERE id = ?").run(JSON.stringify(points), id);
}

export function deleteSceneDrawing(id: string): void {
  db.prepare("DELETE FROM scene_drawings WHERE id = ?").run(id);
}
