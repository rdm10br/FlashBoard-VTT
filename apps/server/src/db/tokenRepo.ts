import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export function createToken(sceneId: string, x: number, y: number, assetId?: string, ownerUserId?: string, sheetId?: string) {
  const id = generateId("token");
  const create = db.transaction(() => {
    const scene = db.prepare("SELECT session_id FROM scenes WHERE id = ?").get(sceneId) as { session_id: string } | undefined;
    if (!scene) throw new Error("Scene not found");
    const actualSheetId = sheetId ?? generateId("sheet");
    if (!sheetId) db.prepare("INSERT INTO character_sheets(id, session_id, name) VALUES (?, ?, ?)").run(actualSheetId, scene.session_id, "Ficha");
    const inheritedAsset = sheetId ? (db.prepare("SELECT asset_id FROM tokens WHERE sheet_id=? AND asset_id IS NOT NULL ORDER BY rowid LIMIT 1").get(actualSheetId) as { asset_id: string } | undefined)?.asset_id : undefined;
    db.prepare("INSERT INTO tokens (id, scene_id, asset_id, owner_user_id, x, y, sheet_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, sceneId, assetId ?? inheritedAsset ?? null, ownerUserId ?? null, x, y, actualSheetId);
    if (ownerUserId) db.prepare("INSERT OR IGNORE INTO character_sheet_owners(sheet_id, user_id) VALUES (?, ?)").run(actualSheetId, ownerUserId);
  });
  create();
  return getToken(id)!;
}

function withOwners<T extends { id: string }>(token: T) {
  const owner_user_ids = (db.prepare("SELECT o.user_id FROM character_sheet_owners o JOIN tokens t ON t.sheet_id=o.sheet_id WHERE t.id = ? ORDER BY o.created_at, o.user_id").all(token.id) as { user_id: string }[]).map((r) => r.user_id);
  return { ...token, owner_user_ids };
}

export function setTokenOwners(tokenIds: string[], userIds: string[]) {
  if (!tokenIds.length) return [];
  const update = db.transaction(() => {
    const sheetIds = db.prepare(`SELECT DISTINCT sheet_id FROM tokens WHERE id IN (${tokenIds.map(() => "?").join(",")})`).all(...tokenIds) as { sheet_id: string }[];
    const remove = db.prepare("DELETE FROM character_sheet_owners WHERE sheet_id = ?");
    const add = db.prepare("INSERT INTO character_sheet_owners(sheet_id, user_id) VALUES (?, ?)");
    for (const { sheet_id } of sheetIds) {
      remove.run(sheet_id);
      for (const userId of userIds) add.run(sheet_id, userId);
    }
  });
  update();
  return tokenIds.map((id) => ({ token_id: id, owner_user_ids: (getToken(id)?.owner_user_ids ?? []) }));
}

export function getToken(id: string) {
  const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as
  | { id: string; scene_id: string; asset_id: string | null; x: number; y: number; owner_user_id: string | null; sheet_id: string }
    | undefined;
  return token ? withOwners(token) : undefined;
}

export function getTokensForScene(sceneId: string) {
  const tokens = db.prepare(
    // "SELECT * FROM tokens WHERE scene_id = ? ORDER BY id"
    "SELECT * FROM tokens WHERE scene_id = ? ORDER BY rowid"
  ).all(sceneId) as { id: string; x: number; y: number; asset_id: string | null; owner_user_id: string | null; sheet_id: string; created_at: number }[];
  return tokens.map(withOwners);
}

export function getTokensForSession(sessionId: string) {
  return db.prepare(
    `SELECT t.x, t.y, t.updated_at AS created_at, s.id AS scene_id, s.name AS scene_name
     FROM tokens t
     JOIN scenes s ON s.id = t.scene_id
     WHERE s.session_id = ?
     ORDER BY t.rowid`
  ).all(sessionId) as { scene_id: string; scene_name: string; x: number; y: number; created_at: number }[];
}

export function moveToken(id: string, x: number, y: number) {
  db.prepare(
    "UPDATE tokens SET x = ?, y = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(x, y, id);
}

export function deleteToken(id: string) {
  db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
}

export function setTokenAsset(id: string, assetId: string): void {
  db.prepare("UPDATE tokens SET asset_id = ?, updated_at = unixepoch() WHERE id = ?").run(assetId, id);
}
