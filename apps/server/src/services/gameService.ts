import type { Role } from "../db/index.js";
import type { SceneMap } from "@vtt/protocol";
import { createScene, getScene, setSceneVisibility, createToken, getTokensForScene, moveToken, setTokenAsset } from "../db/index.js";

export function createSceneForSession(sessionId: string, name: string) {
  const scene = createScene(sessionId, name);
  setSceneVisibility(scene.id, true);
  return scene;
}

export function getSceneState(sceneId: string) {
  const scene = getScene(sceneId);
  if (!scene) return { scene_id: sceneId, tokens: [], map: null };
  const tokens = getTokensForScene(sceneId);
  const map: SceneMap | null = scene.map_asset_id && scene.map_asset_kind === "map_image"
    ? {
        asset_id: scene.map_asset_id,
        x: scene.map_x,
        y: scene.map_y,
        scale: scene.map_scale,
      }
    : null;
  return { scene_id: sceneId, tokens, map };
}

export function canEnterScene(sceneId: string, session_id: string, role: Role) {
  const scene = getScene(sceneId);
  if (!scene || scene.session_id !== session_id) return undefined;
  if ((role === "player" || role === "viewer") && !scene.is_visible) return undefined;
  return scene;
}

export function createTokenOnScene(sceneId: string, x: number, y: number, assetId?: string) {
  return createToken(sceneId, x, y, assetId);
}

export function moveTokenOnScene(id: string, x: number, y: number) {
  moveToken(id, x, y);
}

export function setTokenAssetOnToken(id: string, assetId: string) {
  setTokenAsset(id, assetId);
}

export function setSceneVisibilityOnScene(sceneId: string, visible: boolean) {
  setSceneVisibility(sceneId, visible);
}
