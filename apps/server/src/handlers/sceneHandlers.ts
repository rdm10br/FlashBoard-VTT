import type { ClientMessage, SceneConfig, SceneMeasurementConfig } from "@vtt/protocol";
import { LIMITS } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import {
  canEnterScene,
  createSceneForSession,
  getSceneState,
  setSceneVisibilityOnScene,
} from "../services/gameService.js";
import { deleteScene, getAsset, getMembersForSession, getScene, getScenesForSession, renameScene, reorderScenes, setActiveScene, setMemberScene, setMembersScene, setSceneMap, setSceneConfig, setSceneMeasurementConfig } from "../db/index.js";
import { clientRegistry } from "../clientRegistry.js";
import { broadcastToScene, broadcastToSession, send, sendSceneState } from "../ws/broadcast.js";

function getParty(sessionId: string) {
  const clients = clientRegistry.inSession(sessionId);
  const members = getMembersForSession(sessionId);
  const party = members.filter((m) => m.role === "player").map((m) => ({
    user_id: m.id, nickname: m.nickname, role: m.role, scene_id: m.current_scene_id,
    online: clients.some((client) => client.user_id === m.id),
  }));
  const partySceneId = party.length > 0 && party[0].scene_id && party.every((member) => member.scene_id === party[0].scene_id)
    ? party[0].scene_id : null;
  return { party, party_scene_id: partySceneId };
}

function sceneListForRole(sessionId: string, role: string) {
  if (role === "gm") return getScenesForSession(sessionId).map((s) => ({ id: s.id, name: s.name, is_visible: !!s.is_visible, sort_order: s.sort_order }));
  if (role === "viewer") return getScenesForSession(sessionId).filter((s) => !!s.is_visible && getParty(sessionId).party.some((p) => p.scene_id === s.id)).map((s) => ({ id: s.id, name: s.name, is_visible: !!s.is_visible, sort_order: s.sort_order }));
  return getScenesForSession(sessionId).filter((s) => !!s.is_visible).map((s) => ({ id: s.id, name: s.name, is_visible: !!s.is_visible, sort_order: s.sort_order }));
}

function partyForRole(sessionId: string, role: string, party: ReturnType<typeof getParty>) {
  if (role !== "viewer") return party;
  const occupiedVisible = new Set(getScenesForSession(sessionId).filter((scene) => scene.is_visible && party.party.some((member) => member.scene_id === scene.id)).map((scene) => scene.id));
  return {
    party: party.party.filter((member) => member.scene_id && occupiedVisible.has(member.scene_id)),
    party_scene_id: party.party_scene_id && occupiedVisible.has(party.party_scene_id) ? party.party_scene_id : null,
  };
}

function sendSceneList(ws: HandlerContext["ws"], state: HandlerContext["state"]) {
  if (!state.session_id) return;
  const party = partyForRole(state.session_id, state.role, getParty(state.session_id));
  send(ws, { type: "SCENE_LIST", payload: { session_id: state.session_id, scenes: sceneListForRole(state.session_id, state.role), ...party } });
}

function publishPartyState(sessionId: string) {
  const party = getParty(sessionId);
  for (const client of clientRegistry.inSession(sessionId)) {
    send(client.ws, { type: "SCENE_PARTY_STATE", payload: { session_id: sessionId, ...partyForRole(sessionId, client.role, party) } });
  }
}

function deliverScene(client: import("../clientRegistry.js").ClientState, sceneId: string) {
  clientRegistry.setScene(client, sceneId);
  send(client.ws, { type: "SCENE_STATE", payload: getSceneState(sceneId, client.user_id!) });
}

function syncViewers(sessionId: string) {
  const { party, party_scene_id } = getParty(sessionId);
  const available = getScenesForSession(sessionId).filter((s) => s.is_visible && party.some((p) => p.scene_id === s.id));
  for (const viewer of clientRegistry.inSession(sessionId).filter((c) => c.role === "viewer")) {
    const isAvailable = available.some((scene) => scene.id === viewer.scene_id);
    const partyTarget = party_scene_id && available.some((scene) => scene.id === party_scene_id) ? party_scene_id : null;
    const target = partyTarget ?? (isAvailable ? viewer.scene_id : available[0]?.id);
    if (target && target !== viewer.scene_id) deliverScene(viewer, target);
    else if (!target && viewer.scene_id) { clientRegistry.setScene(viewer, null); send(viewer.ws, { type: "SCENE_CLEARED", payload: {} }); }
  }
  publishPartyState(sessionId);
  for (const client of clientRegistry.inSession(sessionId)) sendSceneList(client.ws, client);
}

export function refreshSceneParty(sessionId: string) { syncViewers(sessionId); }

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
  for (const client of clientRegistry.inSession(state.session_id!)) sendSceneList(client.ws, client);
}

function handleSceneListRequest(_payload: {}, ctx: HandlerContext) { sendSceneList(ctx.ws, ctx.state); }

function handleSceneSwitch(payload: { scene_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!payload?.scene_id || typeof payload.scene_id !== "string") return;
  let scene = canEnterScene(payload.scene_id, state.session_id!, state.role);
  if (!scene && state.role === "player") {
    const assigned = getMembersForSession(state.session_id!).find((member) => member.id === state.user_id)?.current_scene_id;
    const hiddenAssignedScene = getScene(payload.scene_id);
    if (assigned === payload.scene_id && hiddenAssignedScene?.session_id === state.session_id) scene = hiddenAssignedScene;
  }
  if (!scene) return;
  if (state.role === "player") {
    const assigned = getMembersForSession(state.session_id!).find((member) => member.id === state.user_id)?.current_scene_id;
    if (assigned && assigned !== scene.id) {
      send(ws, { type: "SESSION_ERROR", payload: { message: "O mestre controla a mudança de cena dos jogadores." } }); return;
    }
  }
  clientRegistry.setScene(state, payload.scene_id);
  if (state.role === "player") setMemberScene(state.session_id!, state.user_id!, scene.id);
  if (state.role === "gm") setActiveScene(state.session_id!, scene.id);
  sendSceneState(ws, payload.scene_id, state.user_id!);
  syncViewers(state.session_id!);
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
  const players = getMembersForSession(session_id).filter((m) => m.role === "player").map((m) => m.id);
  setMembersScene(session_id, players, scene_id);
  for (const client of clientRegistry.inSession(session_id)) if (client.user_id) deliverScene(client, scene_id);
  syncViewers(session_id);
}

function handleSceneAssignPlayers(payload: { scene_id: string; user_ids: string[] }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id || !scene.is_visible) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Selecione uma cena publicada desta sessão." } }); return;
  }
  const members = getMembersForSession(state.session_id!);
  const ids = [...new Set(payload.user_ids)];
  if (ids.some((id) => !members.some((m) => m.id === id && m.role === "player"))) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "A seleção contém alguém que não é player desta sessão." } }); return;
  }
  setMembersScene(state.session_id!, ids, scene.id);
  for (const client of clientRegistry.inSession(state.session_id!).filter((c) => c.user_id && ids.includes(c.user_id))) deliverScene(client, scene.id);
  syncViewers(state.session_id!);
}

function handleSceneRename(payload: { scene_id: string; name: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  const name = payload.name.trim(); const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id || !name || name.length > LIMITS.name) return;
  renameScene(scene.id, name);
  for (const client of clientRegistry.inSession(state.session_id!)) sendSceneList(client.ws, client);
}

function handleSceneReorder(payload: { scene_ids: string[] }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  const scenes = getScenesForSession(state.session_id!);
  if (payload.scene_ids.length !== scenes.length || new Set(payload.scene_ids).size !== scenes.length || payload.scene_ids.some((id) => !scenes.some((s) => s.id === id))) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "A ordem enviada não corresponde às cenas da sessão." } }); return;
  }
  reorderScenes(state.session_id!, payload.scene_ids);
  for (const client of clientRegistry.inSession(state.session_id!)) sendSceneList(client.ws, client);
}

function handleSceneDelete(payload: { scene_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") return;
  const scenes = getScenesForSession(state.session_id!); const scene = getScene(payload.scene_id);
  if (!scene || scene.session_id !== state.session_id) return;
  if (scenes.length <= 1) { send(ws, { type: "SESSION_ERROR", payload: { message: "A sessão precisa manter ao menos uma cena." } }); return; }
  const fallback = scenes.find((entry) => entry.id !== scene.id && entry.is_visible) ?? scenes.find((entry) => entry.id !== scene.id)!;
  if (!fallback.is_visible) setSceneVisibilityOnScene(fallback.id, true);
  const displaced = getMembersForSession(state.session_id!).filter((member) => member.current_scene_id === scene.id && member.role === "player").map((member) => member.id);
  setMembersScene(state.session_id!, displaced, fallback.id);
  deleteScene(scene.id);
  setActiveScene(state.session_id!, fallback.id);
  for (const client of clientRegistry.inSession(state.session_id!)) {
    if (client.scene_id !== scene.id || !client.user_id) continue;
    if (client.role === "viewer" && !fallback.is_visible) { clientRegistry.setScene(client, null); send(client.ws, { type: "SCENE_CLEARED", payload: {} }); }
    else deliverScene(client, fallback.id);
  }
  broadcastToSession(state.session_id!, { type: "SCENE_DELETED", payload: { scene_id: scene.id, replacement_scene_id: fallback.id } });
  syncViewers(state.session_id!);
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
  syncViewers(state.session_id!);
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

function handleSceneMeasureConfigSet(
  payload: Extract<ClientMessage, { type: "SCENE_MEASURE_CONFIG_SET" }>['payload'],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (state.role !== "gm") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode configurar a régua da cena." } });
    return;
  }
  if (!payload || payload.scene_id !== state.scene_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Selecione a cena antes de configurar a régua." } });
    return;
  }
  const scene = getScene(payload.scene_id);
  const config = payload.config as SceneMeasurementConfig;
  if (!scene || scene.session_id !== state.session_id || !config ||
      !["grid", "custom", "free"].includes(config.mode) ||
      typeof config.unit_label !== "string" || config.unit_label.trim().length < 1 || config.unit_label.length > 40 ||
      !Number.isFinite(config.units_per_cell) || config.units_per_cell < 0.001 || config.units_per_cell > 1_000_000 ||
      typeof config.snap_to_cell_centers !== "boolean") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Configuração de medida inválida." } });
    return;
  }
  const normalized = { ...config, unit_label: config.unit_label.trim() };
  setSceneMeasurementConfig(scene.id, normalized);
  broadcastToScene(scene.id, { type: "SCENE_MEASURE_CONFIG_CHANGED", payload: { scene_id: scene.id, config: normalized } });
}

export const sceneHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SCENE_CREATE: handleSceneCreate,
  SCENE_LIST_REQUEST: handleSceneListRequest,
  SCENE_RENAME: handleSceneRename,
  SCENE_DELETE: handleSceneDelete,
  SCENE_REORDER: handleSceneReorder,
  SCENE_ASSIGN_PLAYERS: handleSceneAssignPlayers,
  SCENE_SWITCH: handleSceneSwitch,
  SCENE_PUSH: handleScenePush,
  SCENE_SET_VISIBLE: handleSceneSetVisible,
  SCENE_MAP_SET: handleSceneMapSet,
  SCENE_CONFIG_SET: handleSceneConfigSet,
  SCENE_MEASURE_CONFIG_SET: handleSceneMeasureConfigSet,
};
