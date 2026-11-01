import { LIMITS } from "./limits.js";
import type { ClientMessage, GridType, Role } from "./index.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength = LIMITS.wsPayloadBytes): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function hasString(record: RecordValue, key: string, maxLength = LIMITS.wsPayloadBytes): boolean {
  return isString(record[key], maxLength);
}

function hasOptionalString(record: RecordValue, key: string, maxLength = LIMITS.wsPayloadBytes): boolean {
  return !(key in record) || isString(record[key], maxLength);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinate(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= LIMITS.coordinate;
}

function isRole(value: unknown): value is Role {
  return value === "gm" || value === "player" || value === "viewer";
}

function isUploadAssetKind(value: unknown): value is "token_image" | "map_image" {
  return value === "token_image" || value === "map_image";
}

function isSceneConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const gridTypes: GridType[] = ["square", "hex_pointy", "hex_flat", "none"];
  return (
    isFiniteNumber(value.width) && value.width >= LIMITS.sceneSize.min && value.width <= LIMITS.sceneSize.max &&
    isFiniteNumber(value.height) && value.height >= LIMITS.sceneSize.min && value.height <= LIMITS.sceneSize.max &&
    gridTypes.includes(value.grid_type as GridType) &&
    isFiniteNumber(value.grid_size) && value.grid_size >= LIMITS.gridSize.min && value.grid_size <= LIMITS.gridSize.max &&
    isString(value.grid_color, 32) &&
    isFiniteNumber(value.grid_opacity) && value.grid_opacity >= 0 && value.grid_opacity <= 1
  );
}

function isInvitePayload(value: unknown): boolean {
  if (!isRecord(value) || !hasString(value, "session_id", 256) || !isRole(value.role)) return false;
  if ("max_uses" in value && (!Number.isInteger(value.max_uses) || (value.max_uses as number) < 1)) return false;
  if ("expires_at" in value && (!Number.isInteger(value.expires_at) || (value.expires_at as number) < 0)) return false;
  return true;
}

/** Validate untrusted JSON at the WebSocket boundary before dispatching handlers. */
export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!isRecord(value) || !isString(value.type, 100)) return undefined;
  const payload = value.payload;
  let valid = false;

  switch (value.type) {
    case "PING":
      valid = isString(payload);
      break;
    case "USER_REGISTER":
      valid = isRecord(payload) && hasString(payload, "email", 254) && hasString(payload, "nickname", LIMITS.nickname) &&
        hasString(payload, "password", 128) && hasOptionalString(payload, "bootstrap_token", 512);
      break;
    case "USER_LOGIN":
      valid = isRecord(payload) && hasString(payload, "identifier", 254) && hasString(payload, "password", 128);
      break;
    case "USER_RESUME":
      valid = isRecord(payload) && hasString(payload, "token", 512);
      break;
    case "USER_LOGOUT":
    case "ADMIN_LIST_USERS":
    case "BACKUP_IMPORT_GRANT_REQUEST":
      valid = isRecord(payload);
      break;
    case "ADMIN_SET_USER_CREDENTIALS":
      valid = isRecord(payload) && hasString(payload, "user_id", 256) && hasString(payload, "email", 254) && hasString(payload, "password", 128);
      break;
    case "SESSION_CREATE":
      valid = isRecord(payload) && hasString(payload, "name", LIMITS.name);
      break;
    case "SESSION_JOIN":
      valid = isRecord(payload) && hasString(payload, "code", 256);
      break;
    case "SESSION_ENTER":
    case "BACKUP_EXPORT_REQUEST":
    case "ASSET_LIST_REQUEST":
      valid = isRecord(payload) && hasString(payload, "session_id", 256);
      break;
    case "SESSION_SET_DEFAULT_TOKEN_ASSET":
      valid = isRecord(payload) && (payload.asset_id === null || hasString(payload, "asset_id", 256));
      break;
    case "SESSION_MEMBERS_REQUEST":
      valid = isRecord(payload) && hasString(payload, "session_id", 256);
      break;
    case "INVITE_CREATE":
      valid = isInvitePayload(payload);
      break;
    case "INVITE_DELETE":
      valid = isRecord(payload) && hasString(payload, "code", 256);
      break;
    case "SCENE_CREATE":
      valid = isRecord(payload) && hasString(payload, "name", LIMITS.name);
      break;
    case "SCENE_LIST_REQUEST": valid = isRecord(payload); break;
    case "SCENE_RENAME": valid = isRecord(payload) && hasString(payload, "scene_id", 256) && hasString(payload, "name", LIMITS.name); break;
    case "SCENE_DELETE": valid = isRecord(payload) && hasString(payload, "scene_id", 256); break;
    case "SCENE_REORDER": valid = isRecord(payload) && Array.isArray(payload.scene_ids) && payload.scene_ids.length <= 200 && payload.scene_ids.every((id) => isString(id, 256)); break;
    case "SCENE_ASSIGN_PLAYERS": valid = isRecord(payload) && hasString(payload, "scene_id", 256) && Array.isArray(payload.user_ids) && payload.user_ids.length <= 200 && payload.user_ids.every((id) => isString(id, 256)); break;
    case "SHEETS_LIST_REQUEST": valid = isRecord(payload); break;
    case "SHEET_TEMPLATE_SET": valid = isSheetTemplate(payload); break;
    case "SHEET_UPDATE": valid = isRecord(payload) && hasString(payload, "id", 256) && hasString(payload, "name", LIMITS.name) && isSheetData(payload.data); break;
    case "SHEET_ACTION": valid = isRecord(payload) && hasString(payload, "sheet_id", 256) && hasString(payload, "action_id", 80) && isSheetData(payload.data); break;
    case "SCENE_SWITCH":
    case "SCENE_PUSH":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256);
      break;
    case "SCENE_SET_VISIBLE":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256) && typeof payload.visible === "boolean";
      break;
    case "SCENE_MAP_SET":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256) && (
        payload.asset_id === null || (
          hasString(payload, "asset_id", 256) && isCoordinate(payload.x) && isCoordinate(payload.y) &&
          isFiniteNumber(payload.scale) && payload.scale >= 0.05 && payload.scale <= 10
        )
      );
      break;
    case "SCENE_CONFIG_SET":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256) && isSceneConfig(payload);
      break;
    case "SCENE_MEASURE_CONFIG_SET":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256) && isSceneMeasurementConfig(payload.config);
      break;
    case "SCENE_DRAWING_CREATE":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256) && isDrawingKind(payload.kind) &&
        isDrawingPoints(payload.kind, payload.points) && typeof payload.shared === "boolean" && typeof payload.keep === "boolean";
      break;
    case "SCENE_DRAWING_MOVE":
      valid = isRecord(payload) && hasString(payload, "id", 256) && isDrawingPoints("freehand", payload.points);
      break;
    case "SCENE_DRAWING_DELETE":
      valid = isRecord(payload) && hasString(payload, "id", 256);
      break;
    case "TOKEN_CREATE_REQUEST":
      valid = isRecord(payload) && hasString(payload, "scene_id", 256) && isCoordinate(payload.x) && isCoordinate(payload.y) &&
        hasOptionalString(payload, "asset_id", 256);
      break;
    case "TOKEN_MOVE":
      valid = isRecord(payload) && hasString(payload, "id", 256) && isCoordinate(payload.x) && isCoordinate(payload.y);
      break;
    case "TOKEN_SET_ASSET":
      valid = isRecord(payload) && hasString(payload, "id", 256) && hasString(payload, "asset_id", 256);
      break;
    case "TOKEN_DELETE":
      valid = isRecord(payload) && hasString(payload, "id", 256);
      break;
    case "TOKEN_OWNERS_SET":
      valid = isRecord(payload) && Array.isArray(payload.token_ids) && payload.token_ids.length > 0 && payload.token_ids.length <= 100 && payload.token_ids.every((id) => isString(id, 256)) && Array.isArray(payload.owner_user_ids) && payload.owner_user_ids.length <= 100 && payload.owner_user_ids.every((id) => isString(id, 256));
      break;
    case "ASSET_UPLOAD_GRANT_REQUEST":
      valid = isRecord(payload) && hasString(payload, "session_id", 256) &&
        (!("asset_kind" in payload) || isUploadAssetKind(payload.asset_kind));
      break;
    case "ASSET_DELETE_REQUEST":
      valid = isRecord(payload) && hasString(payload, "asset_id", 256);
      break;
    case "CHAT_SEND":
      valid = isRecord(payload) && hasString(payload, "text", LIMITS.chatText);
      break;
    default:
      return undefined;
  }

  return valid ? value as unknown as ClientMessage : undefined;
}

function isDrawingKind(value: unknown): value is "line" | "ellipse" | "polygon" | "freehand" | "measurement" {
  return value === "line" || value === "ellipse" || value === "polygon" || value === "freehand" || value === "measurement";
}

function isDrawingPoints(kind: unknown, value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 2000 || value.length % 2 !== 0) return false;
  if (!value.every((n) => isCoordinate(n))) return false;
  const count = value.length / 2;
  if (kind === "line" || kind === "ellipse" || kind === "measurement") return count === 2;
  if (kind === "polygon") return count >= 3;
  return true;
}

function isSceneMeasurementConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.mode === "grid" || value.mode === "custom" || value.mode === "free") &&
    isString(value.unit_label, 40) && value.unit_label.trim().length > 0 &&
    isFiniteNumber(value.units_per_cell) && value.units_per_cell >= 0.001 && value.units_per_cell <= 1_000_000 &&
    typeof value.snap_to_cell_centers === "boolean";
}

function isSheetData(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.keys(value).length <= 200 && Object.entries(value).every(([key, item]) => key.length <= 80 && isString(item, 2000));
}

function isSheetTemplate(value: unknown): boolean {
  if (!isRecord(value) || !hasString(value, "html", 100_000) || !hasString(value, "css", 100_000) || !Array.isArray(value.actions) || value.actions.length > 100) return false;
  return value.actions.every((action) => isRecord(action) && hasString(action, "id", 80) && hasString(action, "label", 120) &&
    (action.kind === "roll" ? hasString(action, "expression", 256) : action.kind === "chat" ? hasString(action, "text", 2000) : action.kind === "map" && action.operation === "ping"));
}
