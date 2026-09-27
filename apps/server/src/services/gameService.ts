import type { Role } from "../db/index.js";
import { createScene, getScene, setSceneVisibility, createToken, getTokensForScene, moveToken } from "../db/index.js";

export function createSceneForSession(sessionId: string, name: string) {
  const scene = createScene(sessionId, name);
  setSceneVisibility(scene.id, true);
  return scene;
}

export function getSceneState(sceneId: string) {
  const tokens = getTokensForScene(sceneId);
  return { scene_id: sceneId, tokens };
}

export function canEnterScene(sceneId: string, session_id: string, role: Role) {
  const scene = getScene(sceneId);
  if (!scene || scene.session_id !== session_id) return undefined;
  if ((role === "player" || role === "viewer") && !scene.is_visible) return undefined;
  return scene;
}

export function createTokenOnScene(sceneId: string, x: number, y: number) {
  return createToken(sceneId, x, y);
}

export function moveTokenOnScene(id: string, x: number, y: number) {
  moveToken(id, x, y);
}

export function setSceneVisibilityOnScene(sceneId: string, visible: boolean) {
  setSceneVisibility(sceneId, visible);
}
