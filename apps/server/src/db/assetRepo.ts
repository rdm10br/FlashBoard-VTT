import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export type AssetKind = "token_image" | "map_image" | "character_sheet";

export type Asset = {
  id: string;
  session_id: string;
  kind: AssetKind;
  filename: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
};

export function createAsset(opts: {
  sessionId: string;
  kind: AssetKind;
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}): Asset {
  const id = generateId("asset");
  db.prepare(`
    INSERT INTO assets (id, session_id, kind, filename, path, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, opts.sessionId, opts.kind, opts.filename, opts.path, opts.mimeType, opts.sizeBytes);
  return getAsset(id)!;
}

export function getAsset(id: string): Asset | undefined {
  return db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Asset | undefined;
}

export function getAssetsForSession(sessionId: string): Asset[] {
  return db.prepare("SELECT * FROM assets WHERE session_id = ? ORDER BY created_at").all(sessionId) as Asset[];
}

export function deleteAsset(id: string): void {
  db.prepare("DELETE FROM assets WHERE id = ?").run(id);
}