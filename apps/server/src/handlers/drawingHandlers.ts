import type { ClientMessage, SceneDrawing, SceneDrawingKind } from "@vtt/protocol";
import { getScene, getSceneDrawing, createSceneDrawing, moveSceneDrawing, deleteSceneDrawing, generateId } from "../db/index.js";
import type { HandlerContext, MessageHandler } from "./types.js";
import { broadcastToScene, send } from "../ws/broadcast.js";
import { clientRegistry } from "../clientRegistry.js";

type EphemeralDrawing = SceneDrawing & { expires_at: number };
const ephemeralDrawings = new Map<string, EphemeralDrawing>();
const MAX_POINTS = 1000;
const EPHEMERAL_MEASUREMENT_TTL_MS = 5_000;

function validPoints(kind: SceneDrawingKind, points: unknown, width: number, height: number): points is number[] {
  if (!Array.isArray(points) || points.length < 4 || points.length > MAX_POINTS * 2 || points.length % 2 !== 0) return false;
  if (!points.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  const count = points.length / 2;
  if ((kind === "line" || kind === "ellipse") && count !== 2) return false;
  if (kind === "polygon" && count < 3) return false;
  for (let i = 0; i < points.length; i += 2) {
    if (points[i] < 0 || points[i] > width || points[i + 1] < 0 || points[i + 1] > height) return false;
  }
  return true;
}

function canManage(drawing: SceneDrawing, userId: string, role: string): boolean {
  return role === "gm" || drawing.owner_user_id === userId;
}

function publishDrawing(drawing: SceneDrawing, ws: HandlerContext["ws"]): void {
  const message = { type: "SCENE_DRAWING_CREATED" as const, payload: { drawing } };
  if (drawing.shared) broadcastToScene(drawing.scene_id, message);
  else send(ws, message);
}

function handleCreate(payload: Extract<ClientMessage, { type: "SCENE_DRAWING_CREATE" }>['payload'], ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!state.scene_id || payload.scene_id !== state.scene_id || !state.user_id) return;
  const scene = getScene(state.scene_id);
  if (!scene || scene.session_id !== state.session_id || !validPoints(payload.kind, payload.points, scene.width, scene.height)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Desenho ou medição inválidos para esta cena." } });
    return;
  }

  const shared = payload.kind === "measurement" ? payload.shared : true;
  if (payload.kind === "measurement" && !payload.keep) {
    const drawing: EphemeralDrawing = {
      id: generateId("measure"), scene_id: scene.id, owner_user_id: state.user_id,
      kind: payload.kind, points: payload.points, shared, persistent: false,
      expires_at: Date.now() + EPHEMERAL_MEASUREMENT_TTL_MS,
    };
    ephemeralDrawings.set(drawing.id, drawing);
    setTimeout(() => {
      if (!ephemeralDrawings.delete(drawing.id)) return;
      const message = { type: "SCENE_DRAWING_DELETED" as const, payload: { scene_id: drawing.scene_id, drawing_id: drawing.id } };
      if (drawing.shared) broadcastToScene(drawing.scene_id, message);
      else {
        for (const client of clientRegistry.inUser(drawing.owner_user_id)) {
          if (client.scene_id === drawing.scene_id) send(client.ws, message);
        }
      }
    }, EPHEMERAL_MEASUREMENT_TTL_MS).unref?.();
    publishDrawing(drawing, ws);
    return;
  }

  const drawing = createSceneDrawing({
    scene_id: scene.id, owner_user_id: state.user_id, kind: payload.kind,
    points: payload.points, shared,
  });
  publishDrawing(drawing, ws);
}

function handleMove(payload: Extract<ClientMessage, { type: "SCENE_DRAWING_MOVE" }>['payload'], ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!state.scene_id || !state.user_id) return;
  const drawing = getSceneDrawing(payload.id) ?? ephemeralDrawings.get(payload.id);
  if (!drawing || drawing.scene_id !== state.scene_id || !canManage(drawing, state.user_id, state.role)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Você não pode mover este desenho." } });
    return;
  }
  const scene = getScene(drawing.scene_id);
  if (!scene || !validPoints(drawing.kind, payload.points, scene.width, scene.height)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "A nova posição do desenho é inválida." } });
    return;
  }
  const updated = { ...drawing, points: payload.points };
  if (drawing.persistent) moveSceneDrawing(drawing.id, payload.points);
  else ephemeralDrawings.set(drawing.id, { ...updated, expires_at: ephemeralDrawings.get(drawing.id)!.expires_at });
  const message = { type: "SCENE_DRAWING_MOVED" as const, payload: { drawing: updated } };
  if (drawing.shared) broadcastToScene(drawing.scene_id, message);
  else send(ws, message);
}

function handleDelete(payload: Extract<ClientMessage, { type: "SCENE_DRAWING_DELETE" }>['payload'], ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!state.scene_id || !state.user_id) return;
  const drawing = getSceneDrawing(payload.id) ?? ephemeralDrawings.get(payload.id);
  if (!drawing || drawing.scene_id !== state.scene_id || !canManage(drawing, state.user_id, state.role)) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Você não pode apagar este desenho." } });
    return;
  }
  if (drawing.persistent) deleteSceneDrawing(drawing.id);
  else ephemeralDrawings.delete(drawing.id);
  const message = { type: "SCENE_DRAWING_DELETED" as const, payload: { scene_id: drawing.scene_id, drawing_id: drawing.id } };
  if (drawing.shared) broadcastToScene(drawing.scene_id, message);
  else send(ws, message);
}

export const drawingHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SCENE_DRAWING_CREATE: handleCreate,
  SCENE_DRAWING_MOVE: handleMove,
  SCENE_DRAWING_DELETE: handleDelete,
};
