import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import {
  canEnterScene,
  createSceneForSession,
  getSceneState,
  setSceneVisibilityOnScene,
} from "../services/gameService.js";
import { clientRegistry } from "../clientRegistry.js";
import { broadcastToSession, sendSceneState } from "../ws/broadcast.js";
import { activeScenesPerSession } from "../state/activeScenes.js";

function handleSceneCreate(payload: { name: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.name || typeof payload.name !== "string" || !payload.name.trim()) return;
  const scene = createSceneForSession(state.session_id!, payload.name.trim());
  broadcastToSession(state.session_id!, {
    type: "SCENE_CREATED",
    payload: { id: scene.id, name: scene.name, is_visible: true },
  });
}

function handleSceneSwitch(payload: { scene_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!payload?.scene_id || typeof payload.scene_id !== "string") return;
  const scene = canEnterScene(payload.scene_id, state.session_id!, state.role);
  if (!scene) return;
  clientRegistry.setScene(state, payload.scene_id);
  sendSceneState(ws, payload.scene_id);
}

function handleScenePush(payload: { scene_id: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.scene_id || typeof payload.scene_id !== "string") return;
  const session_id = state.session_id!;
  const { scene_id } = payload;
  activeScenesPerSession.set(session_id, scene_id);

  for (const client of clientRegistry.inSession(session_id)) {
    clientRegistry.setScene(client, scene_id);
  }

  broadcastToSession(session_id, { type: "SCENE_PUSHED", payload: { scene_id } });
  broadcastToSession(session_id, { type: "SCENE_STATE", payload: getSceneState(scene_id) });
}

function handleSceneSetVisible(payload: { scene_id: string; visible: boolean }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.scene_id || typeof payload.scene_id !== "string" || typeof payload.visible !== "boolean") return;
  setSceneVisibilityOnScene(payload.scene_id, payload.visible);
  broadcastToSession(state.session_id!, {
    type: "SCENE_VISIBILITY_CHANGED",
    payload: { scene_id: payload.scene_id, visible: payload.visible },
  });
}

export const sceneHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SCENE_CREATE: handleSceneCreate,
  SCENE_SWITCH: handleSceneSwitch,
  SCENE_PUSH: handleScenePush,
  SCENE_SET_VISIBLE: handleSceneSetVisible,
};