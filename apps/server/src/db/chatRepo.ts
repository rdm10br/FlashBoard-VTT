import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { ChatMessage, Role } from "./types.js";

export function createChatMessage(
  sessionId: string,
  sender: string,
  text: string,
  timestamp: number,
  message_type: "text" | "roll" | "whisper" | "secret" | "system" = "text",
  target?: string,
  metadata?: Record<string, any>
) {
  const id = generateId("chat");
  db.prepare(
    "INSERT INTO chat_messages (id, session_id, sender, text, timestamp, message_type, target, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, sessionId, sender, text, timestamp, message_type, target ?? null, metadata ? JSON.stringify(metadata) : null);
  return getChatMessage(id)!;
}

export function getChatMessage(id: string) {
  const row = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as
    | {
        id: string;
        session_id: string;
        sender: string;
        text: string;
        timestamp: number;
        message_type: "text" | "roll" | "whisper" | "secret" | "system";
        target: string | null;
        metadata: string | null;
        created_at: number;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    session_id: row.session_id,
    sender: row.sender,
    text: row.text,
    timestamp: row.timestamp,
    message_type: row.message_type,
    target: row.target ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    roll_details: row.message_type === "roll" && row.metadata ? JSON.parse(row.metadata) : undefined,
    created_at: row.created_at,
  } as ChatMessage;
}

export function getChatMessagesForSession(sessionId: string, role?: Role, requester?: string) {
  const rows = db.prepare(
    "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC"
  ).all(sessionId).map((row: any) => ({
    ...row,
    target: row.target ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    roll_details: row.message_type === "roll" && row.metadata ? JSON.parse(row.metadata) : undefined,
  })) as ChatMessage[];

  if (!role || role === "gm") {
    return rows;
  }

  const requesterName = requester?.toLowerCase() ?? "";
  return rows.filter((message) => {
    if (message.message_type === "secret") {
      return false;
    }
    if (message.message_type === "whisper") {
      return (
        message.sender.toLowerCase() === requesterName ||
        message.target?.toLowerCase() === requesterName
      );
    }
    return true;
  });
}