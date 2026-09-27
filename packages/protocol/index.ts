export type Role = "gm" | "player" | "viewer";

export type Token = {
  id: string;
  x: number;
  y: number;
  asset_id?: string | null;
};

export type Scene = {
  id: string;
  name: string;
  is_visible: boolean;
};

export type SessionSummary = {
  id: string;
  name: string;
  owner_id: string;
  role: Role;
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

export type SceneState = {
  scene_id: string;
  tokens: Token[];
};

export type SessionJoinedPayload = {
  session_id: string;
  session_name: string;
  member: Member;
  invite_codes: InviteCodeSummary[];
  // asset_key: string;
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
  | { type: "USER_LOGIN"; payload: { nickname: string } }
  | { type: "SESSION_CREATE"; payload: { name: string } }
  | { type: "SESSION_JOIN"; payload: { code: string } }
  | { type: "SESSION_ENTER"; payload: { session_id: string } }
  | { type: "SESSION_SET_DEFAULT_TOKEN_ASSET"; payload: { asset_id: string | null } }
  | { type: "INVITE_CREATE"; payload: CreateInvitePayload }
  | { type: "INVITE_DELETE"; payload: { code: string } }
  | { type: "SCENE_CREATE"; payload: { name: string } }
  | { type: "SCENE_SWITCH"; payload: { scene_id: string } }
  | { type: "SCENE_PUSH"; payload: { scene_id: string } }
  | { type: "SCENE_SET_VISIBLE"; payload: { scene_id: string; visible: boolean } }
  | { type: "TOKEN_CREATE_REQUEST"; payload: { scene_id: string; x: number; y: number; asset_id?: string } }
  | { type: "TOKEN_MOVE"; payload: { id: string; x: number; y: number } }
  | { type: "TOKEN_SET_ASSET"; payload: { id: string; asset_id: string } }
  | { type: "BACKUP_EXPORT_REQUEST"; payload: { session_id: string } }
  | { type: "BACKUP_IMPORT_GRANT_REQUEST"; payload: {} }
  | { type: "ASSET_UPLOAD_GRANT_REQUEST"; payload: { session_id: string } }
  | { type: "CHAT_SEND"; payload: { text: string } };

// --- Mensagens Server → Client ---

export type ServerMessage =
  | { type: "CONNECTED"; payload: { boot_id: string } }
  | { type: "USER_STATE"; payload: { user_id: string; nickname: string; sessions: SessionSummary[] } }
  | { type: "USER_ERROR"; payload: { message: string } }
  | { type: "SESSION_JOINED"; payload: SessionJoinedPayload }
  | { type: "SESSION_ERROR"; payload: { message: string } }
  | { type: "SESSION_DEFAULT_TOKEN_ASSET_CHANGED"; payload: { asset_id: string | null } }
  | { type: "INVITE_CREATED"; payload: InviteCodeSummary }
  | { type: "INVITE_DELETED"; payload: { code: string } }
  | { type: "SCENE_CREATED"; payload: Scene }
  | { type: "SCENE_STATE"; payload: SceneState }
  | { type: "SCENE_PUSHED"; payload: { scene_id: string } }
  | { type: "SCENE_VISIBILITY_CHANGED"; payload: { scene_id: string; visible: boolean } }
  | { type: "TOKEN_CREATE"; payload: { id: string; scene_id: string; x: number; y: number; asset_id?: string | null } }
  | { type: "TOKEN_MOVE"; payload: { id: string; x: number; y: number } }
  | { type: "TOKEN_ASSET_CHANGED"; payload: { id: string; asset_id: string } }
  | { type: "BACKUP_GRANT_ISSUED"; payload: { token: string; expires_at: number; kind: "export" | "import" | "asset_upload" } }
  | { type: "CHAT_RECEIVE"; payload: ChatMessage };

export type Message = ClientMessage | ServerMessage;
