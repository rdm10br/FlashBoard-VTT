export type Role = "gm" | "player" | "viewer";
export type UploadAssetKind = "token_image" | "map_image";

export type SessionAsset = {
  id: string;
  kind: UploadAssetKind;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
};

export type Token = {
  id: string;
  x: number;
  y: number;
  asset_id?: string | null;
  owner_user_id?: string | null;
  owner_user_ids?: string[];
  sheet_id: string;
};

export type Scene = {
  id: string;
  name: string;
  is_visible: boolean;
  sort_order?: number;
};

export type ScenePartyMember = { user_id: string; nickname: string; role: Role; scene_id: string | null; online: boolean };
export type SheetAction = { id: string; label: string; kind: "roll" | "chat" | "map"; expression?: string; text?: string; operation?: "ping" };
export type SheetTemplate = { html: string; css: string; actions: SheetAction[] };
export type CharacterSheet = { id: string; name: string; data: Record<string, string>; owner_user_ids: string[]; tokens: { token_id: string; scene_id: string; scene_name: string; x: number; y: number }[] };

export type SessionSummary = {
  id: string;
  name: string;
  owner_id: string;
  role: Role;
};

export type AdminUserSummary = {
  id: string;
  nickname: string;
  email: string | null;
  is_admin: boolean;
  is_legacy: boolean;
};

export type InviteCodeSummary = {
  code: string;
  role: Role;
  use_count: number;
  max_uses: number | null;
  expires_at: number | null;
  created_at: number;
};

export type InviteCodes = {
  player: string;
  gm: string;
};

export type Member = {
  id: string;
  nickname: string;
  role: Role;
};

export type SceneMap = {
  asset_id: string;
  x: number;
  y: number;
  scale: number;
};

export type MeasurementMode = "grid" | "custom" | "free";
export type SceneMeasurementConfig = {
  mode: MeasurementMode;
  unit_label: string;
  units_per_cell: number;
  snap_to_cell_centers: boolean;
};

export type SceneDrawingKind = "line" | "ellipse" | "polygon" | "freehand" | "measurement";
export type SceneDrawing = {
  id: string;
  scene_id: string;
  owner_user_id: string;
  kind: SceneDrawingKind;
  points: number[];
  shared: boolean;
  persistent: boolean;
};

export type SessionJoinedPayload = {
  session_id: string;
  session_name: string;
  member: Member;
  invite_codes: InviteCodeSummary[];
  asset_key: string;
  scenes: Scene[];
  active_scene_id: string;
  default_token_asset_id: string | null;
  chat: ChatMessage[];
};

export type CreateInvitePayload = {
  session_id: string;
  role: Role;
  max_uses?: number;
  expires_at?: number;
};

export type RollDetails = {
  dice: string;
  modifier: number;
  attribute?: string;
  advantage?: boolean;
  disadvantage?: boolean;
  results: number[];
  total: number;
};

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  message_type?: "text" | "roll" | "whisper" | "secret" | "system";
  target?: string;
  roll_details?: RollDetails;
  visible_to?: "all" | "gm" | "sender" | "target" | "sender-target";
  metadata?: Record<string, unknown>;
};

// --- Mensagens Client → Server ---

export type ClientMessage =
  | { type: "PING"; payload: string }
  | { type: "USER_REGISTER"; payload: { email: string; nickname: string; password: string; bootstrap_token?: string } }
  | { type: "USER_LOGIN"; payload: { identifier: string; password: string } }
  | { type: "USER_RESUME"; payload: { token: string } }
  | { type: "USER_LOGOUT"; payload: {} }
  | { type: "ADMIN_LIST_USERS"; payload: {} }
  | { type: "ADMIN_SET_USER_CREDENTIALS"; payload: { user_id: string; email: string; password: string } }
  | { type: "SESSION_CREATE"; payload: { name: string } }
  | { type: "SESSION_JOIN"; payload: { code: string } }
  | { type: "SESSION_ENTER"; payload: { session_id: string } }
  | { type: "SESSION_SET_DEFAULT_TOKEN_ASSET"; payload: { asset_id: string | null } }
  | { type: "SESSION_MEMBERS_REQUEST"; payload: { session_id: string } }
  | { type: "INVITE_CREATE"; payload: CreateInvitePayload }
  | { type: "INVITE_DELETE"; payload: { code: string } }
  | { type: "SCENE_CREATE"; payload: { name: string } }
  | { type: "SCENE_LIST_REQUEST"; payload: {} }
  | { type: "SCENE_RENAME"; payload: { scene_id: string; name: string } }
  | { type: "SCENE_DELETE"; payload: { scene_id: string } }
  | { type: "SCENE_REORDER"; payload: { scene_ids: string[] } }
  | { type: "SCENE_ASSIGN_PLAYERS"; payload: { scene_id: string; user_ids: string[] } }
  | { type: "SHEETS_LIST_REQUEST"; payload: {} }
  | { type: "SHEET_TEMPLATE_SET"; payload: SheetTemplate }
  | { type: "SHEET_UPDATE"; payload: { id: string; name: string; data: Record<string, string> } }
  | { type: "SHEET_ACTION"; payload: { sheet_id: string; action_id: string; data: Record<string, string> } }
  | { type: "SHEET_CREATE"; payload: { name: string } }
  | { type: "SHEET_OWNERS_SET"; payload: { sheet_id: string; owner_user_ids: string[] } }
  | { type: "SCENE_SWITCH"; payload: { scene_id: string } }
  | { type: "SCENE_PUSH"; payload: { scene_id: string } }
  | { type: "SCENE_SET_VISIBLE"; payload: { scene_id: string; visible: boolean } }
  | { type: "SCENE_MAP_SET"; payload: SceneMap & { scene_id: string } | { scene_id: string; asset_id: null } }
  | { type: "SCENE_CONFIG_SET"; payload: SceneConfig & { scene_id: string } }
  | { type: "SCENE_MEASURE_CONFIG_SET"; payload: { scene_id: string; config: SceneMeasurementConfig } }
  | { type: "SCENE_DRAWING_CREATE"; payload: { scene_id: string; kind: SceneDrawingKind; points: number[]; shared: boolean; keep: boolean } }
  | { type: "SCENE_DRAWING_MOVE"; payload: { id: string; points: number[] } }
  | { type: "SCENE_DRAWING_DELETE"; payload: { id: string } }
  | { type: "TOKEN_CREATE_REQUEST"; payload: { scene_id: string; x: number; y: number; asset_id?: string; sheet_id?: string } }
  | { type: "TOKEN_MOVE"; payload: { id: string; x: number; y: number } }
  | { type: "TOKEN_SET_ASSET"; payload: { id: string; asset_id: string } }
  | { type: "TOKEN_DELETE"; payload: { id: string } }
  | { type: "TOKEN_OWNERS_SET"; payload: { token_ids: string[]; owner_user_ids: string[] } }
  | { type: "BACKUP_EXPORT_REQUEST"; payload: { session_id: string } }
  | { type: "BACKUP_IMPORT_GRANT_REQUEST"; payload: {} }
  | { type: "ASSET_UPLOAD_GRANT_REQUEST"; payload: { session_id: string; asset_kind?: "token_image" | "map_image" } }
  | { type: "ASSET_LIST_REQUEST"; payload: { session_id: string } }
  | { type: "ASSET_DELETE_REQUEST"; payload: { asset_id: string } }
  | { type: "CHAT_SEND"; payload: { text: string } };
// --- Mensagens Server → Client ---

export type ServerMessage =
  | { type: "CONNECTED"; payload: { boot_id: string; admin_bootstrap_available: boolean } }
  | { type: "USER_STATE"; payload: { user_id: string; nickname: string; sessions: SessionSummary[]; auth_token: string; is_admin: boolean } }
  | { type: "USER_ERROR"; payload: { message: string } }
  | { type: "USER_LOGGED_OUT"; payload: {} }
  | { type: "ADMIN_USERS"; payload: { users: AdminUserSummary[] } }
  | { type: "SESSION_JOINED"; payload: SessionJoinedPayload }
  | { type: "SESSION_ERROR"; payload: { message: string } }
  | { type: "SESSION_DEFAULT_TOKEN_ASSET_CHANGED"; payload: { asset_id: string | null } }
  | { type: "SESSION_MEMBERS"; payload: { session_id: string; members: Member[] } }
  | { type: "INVITE_CREATED"; payload: InviteCodeSummary }
  | { type: "INVITE_DELETED"; payload: { code: string } }
  | { type: "SCENE_CREATED"; payload: Scene }
  | { type: "SCENE_LIST"; payload: { session_id: string; scenes: Scene[]; party: ScenePartyMember[]; party_scene_id: string | null } }
  | { type: "SCENE_PARTY_STATE"; payload: { session_id: string; party: ScenePartyMember[]; party_scene_id: string | null } }
  | { type: "SCENE_DELETED"; payload: { scene_id: string; replacement_scene_id: string | null } }
  | { type: "SCENE_CLEARED"; payload: {} }
  | { type: "SHEETS_LIST"; payload: { session_id: string; template: SheetTemplate; sheets: CharacterSheet[] } }
  | { type: "SHEET_TEMPLATE_CHANGED"; payload: { session_id: string; template: SheetTemplate } }
  | { type: "SHEET_CHANGED"; payload: { sheet: CharacterSheet } }
  | { type: "MAP_PING"; payload: { scene_id: string; x: number; y: number; label: string; nickname: string } }
  | { type: "SCENE_STATE"; payload: SceneState }
  | { type: "SCENE_PUSHED"; payload: { scene_id: string } }
  | { type: "SCENE_VISIBILITY_CHANGED"; payload: { scene_id: string; visible: boolean } }
  | { type: "SCENE_MAP_CHANGED"; payload: { scene_id: string; map: SceneMap | null } }
  | { type: "SCENE_CONFIG_CHANGED"; payload: { scene_id: string; config: SceneConfig } }
  | { type: "SCENE_MEASURE_CONFIG_CHANGED"; payload: { scene_id: string; config: SceneMeasurementConfig } }
  | { type: "SCENE_DRAWING_CREATED"; payload: { drawing: SceneDrawing } }
  | { type: "SCENE_DRAWING_MOVED"; payload: { drawing: SceneDrawing } }
  | { type: "SCENE_DRAWING_DELETED"; payload: { scene_id: string; drawing_id: string } }
  | { type: "TOKEN_CREATE"; payload: { id: string; scene_id: string; x: number; y: number; asset_id?: string | null; owner_user_id?: string | null; owner_user_ids?: string[]; sheet_id: string } }
  | { type: "TOKEN_OWNERS_CHANGED"; payload: { scene_id: string; tokens: { token_id: string; owner_user_ids: string[] }[] } }
  | { type: "TOKEN_MOVE"; payload: { id: string; x: number; y: number } }
  | { type: "TOKEN_ASSET_CHANGED"; payload: { id: string; asset_id: string | null } }
  | { type: "TOKEN_DELETED"; payload: { id: string } }
  | { type: "BACKUP_GRANT_ISSUED"; payload: { token: string; expires_at: number; kind: "export" | "import" | "asset_upload"; asset_kind?: "token_image" | "map_image" } }
  | { type: "ASSET_LIST"; payload: { session_id: string; assets: SessionAsset[] } }
  | { type: "ASSET_CREATED"; payload: { session_id: string; asset: SessionAsset } }
  | { type: "ASSET_DELETED"; payload: { session_id: string; asset_id: string } }
  | { type: "ASSET_ERROR"; payload: { message: string } }
  | { type: "CHAT_RECEIVE"; payload: ChatMessage };

export type Message = ClientMessage | ServerMessage;

export * from "./limits.js";

export type GridType = "square" | "hex_pointy" | "hex_flat" | "none";

export type SceneConfig = {
  width: number;
  height: number;
  grid_type: GridType;
  grid_size: number;
  grid_color: string;
  grid_opacity: number;
};

export type SceneState = {
  scene_id: string;
  tokens: Token[];
  map: SceneMap | null;
  config: SceneConfig;
  measurement_config: SceneMeasurementConfig;
  drawings: SceneDrawing[];
};

export * from "./validation.js";
