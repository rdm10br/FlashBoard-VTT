import type { ClientMessage, SceneConfig } from "@vtt/protocol";
import { LIMITS } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import {
  canEnterScene,
  createSceneForSession,
  getSceneState,
  setSceneVisibilityOnScene,
} from "../services/gameService.js";
import { getAsset, getScene, setActiveScene, setSceneMap, setSceneConfig } from "../db/index.js";
import { clientRegistry } from "../clientRegistry.js";
import { broadcastToScene, broadcastToSession, send, sendSceneState } from "../ws/broadcast.js";

// function handleSceneCreate(payload: { name: string }, ctx: HandlerContext) {
//   const { state } = ctx;
//   if (state.role !== "gm") return;
//   if (!payload?.name || typeof payload.name !== "string" || !payload.name.trim()) return;
//   const scene = createSceneForSession(state.session_id!, payload.name.trim());
//   broadcastToSession(state.session_id!, {
//     type: "SCENE_CREATED",
//     payload: { id: scene.id, name: scene.name, is_visible: true },
//   });
// }

const GRID_TYPES = ["square", "hex_pointy", "hex_flat", "none"];

function handleSceneCreate(payload: { name: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.name || typeof payload.name !== "string" || !payload.name.trim()) return;
  const name = payload.name.trim();
  if (name.length > LIMITS.name) {
    send(ws, { type: "SESSION_ERROR", payload: { message: `O nome da cena deve ter até ${LIMITS.name} caracteres.` } });
    return;
  }
  const scene = createSceneForSession(state.session_id!, name);
  // Só quem criou recebe: o GameController responde a SCENE_CREATED trocando de cena,
  // então um broadcast arrastaria todos os jogadores. Quando houver UI de lista de
  // cenas, use uma mensagem separada (ex.: SCENE_LIST_CHANGED) para os demais.
  send(ws, {
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
  // const { state } = ctx;
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  if (!payload?.scene_id || typeof payload.scene_id !== "string") return;
  const session_id = state.session_id!;
  const { scene_id } = payload;
  const scene = getScene(scene_id);
  if (!scene || scene.session_id !== session_id) return;
  if (!scene.is_visible) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Torne a cena visível antes de enviá-la aos jogadores." } });
    return;
  }
  setActiveScene(session_id, scene_id);

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
  const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id) return;
  setSceneVisibilityOnScene(payload.scene_id, payload.visible);
  broadcastToSession(state.session_id!, {
    type: "SCENE_VISIBILITY_CHANGED",
    payload: { scene_id: payload.scene_id, visible: payload.visible },
  });
}

function handleSceneMapSet(
  payload: Extract<ClientMessage, { type: "SCENE_MAP_SET" }>["payload"],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (state.role !== "gm") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode alterar o mapa." } });
    return;
  }
  if (!payload || typeof payload.scene_id !== "string" || payload.scene_id !== state.scene_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Selecione a cena antes de alterar seu mapa." } });
    return;
  }

  const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Cena inválida para esta sessão." } });
    return;
  }

  if (payload.asset_id === null) {
    setSceneMap(scene.id, null);
    broadcastToScene(scene.id, {
      type: "SCENE_MAP_CHANGED",
      payload: { scene_id: scene.id, map: null },
    });
    return;
  }

  if (
    typeof payload.asset_id !== "string" ||
    !Number.isFinite(payload.x) ||
    !Number.isFinite(payload.y) ||
    !Number.isFinite(payload.scale) ||
    Math.abs(payload.x) > 1_000_000 ||
    Math.abs(payload.y) > 1_000_000 ||
    payload.scale < 0.05 ||
    payload.scale > 10
  ) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Posição ou escala do mapa inválida." } });
    return;
  }

  const asset = getAsset(payload.asset_id);
  if (!asset || asset.session_id !== state.session_id || asset.kind !== "map_image") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Imagem de mapa inválida para esta sessão." } });
    return;
  }

  const map = {
    asset_id: payload.asset_id,
    x: payload.x,
    y: payload.y,
    scale: payload.scale,
  };
  setSceneMap(scene.id, map);
  broadcastToScene(scene.id, {
    type: "SCENE_MAP_CHANGED",
    payload: { scene_id: scene.id, map },
  });
}

function parseSceneConfig(p: Record<string, unknown>): SceneConfig | null {
  const { width, height, grid_size, grid_opacity, grid_type, grid_color } = p;
  const inRange = (n: unknown, min: number, max: number): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

  if (!inRange(width, LIMITS.sceneSize.min, LIMITS.sceneSize.max)) return null;
  if (!inRange(height, LIMITS.sceneSize.min, LIMITS.sceneSize.max)) return null;
  if (!inRange(grid_size, LIMITS.gridSize.min, LIMITS.gridSize.max)) return null;
  if (!inRange(grid_opacity, 0, 1)) return null;
  if (typeof grid_type !== "string" || !GRID_TYPES.includes(grid_type)) return null;
  if (typeof grid_color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(grid_color)) return null;

  return { width, height, grid_size, grid_opacity, grid_type: grid_type as SceneConfig["grid_type"], grid_color };
}

function handleSceneConfigSet(
  payload: Extract<ClientMessage, { type: "SCENE_CONFIG_SET" }>["payload"],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (state.role !== "gm") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode configurar a cena." } });
    return;
  }
  if (!payload || typeof payload.scene_id !== "string" || payload.scene_id !== state.scene_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Selecione a cena antes de configurá-la." } });
    return;
  }
  const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Cena inválida para esta sessão." } });
    return;
  }
  const config = parseSceneConfig(payload as unknown as Record<string, unknown>);
  if (!config) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Configuração de cena inválida." } });
    return;
  }
  setSceneConfig(scene.id, config);
  broadcastToScene(scene.id, { type: "SCENE_CONFIG_CHANGED", payload: { scene_id: scene.id, config } });
}

export const sceneHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SCENE_CREATE: handleSceneCreate,
  SCENE_SWITCH: handleSceneSwitch,
  SCENE_PUSH: handleScenePush,
  SCENE_SET_VISIBLE: handleSceneSetVisible,
  SCENE_MAP_SET: handleSceneMapSet,
  SCENE_CONFIG_SET: handleSceneConfigSet,
};
