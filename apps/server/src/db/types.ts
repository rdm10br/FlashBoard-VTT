// import { ChatMessage } from "@vtt/protocol";
export type Role = "gm" | "player" | "viewer";

export type User = { id: string; nickname: string };

export type Session = {
  id: string;
  name: string;
  owner_id: string;
  active_scene_id: string | null;
  default_token_asset_id: string | null;
  max_dice_count?: number;
  max_dice_sides?: number;
  // asset_key: string;
  created_at: number;
};

export type Membership = {
  id: string;
  user_id: string;
  session_id: string;
  role: Role;
};

export type InviteCode = {
  code: string;
  session_id: string;
  role: Role;
  created_by: string;
  use_count: number;
  max_uses: number | null;
  expires_at: number | null;
  created_at: number;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  sender: string;
  text: string;
  timestamp: number;
  message_type: "text" | "roll" | "whisper" | "secret" | "system";
  target?: string;
  metadata?: Record<string, unknown>;
  created_at: number;
};

export type CreateInviteOptions = {
  sessionId: string;
  role: Role;
  createdBy: string;
  maxUses?: number;
  expiresAt?: number;
};

export type SessionBackup = {
  session_name: string;
  owner_nickname: string;
  members: { nickname: string; role: Role; created_at: number }[];
  invite_codes: { role: Role; use_count: number; max_uses: number | null; expires_at: number | null; created_at: number }[];
  scenes: { name: string; is_visible: boolean; created_at: number }[];
  tokens: { scene_name: string; x: number; y: number; created_at: number }[];
  chat_messages: { sender: string; text: string; timestamp: number; created_at: number }[];
  created_at: number;
};
