import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export function createToken(sceneId: string, x: number, y: number, assetId?: string, ownerUserId?: string) {
  const id = generateId("token");
  const create = db.transaction(() => {
    db.prepare("INSERT INTO tokens (id, scene_id, asset_id, x, y, owner_user_id) VALUES (?, ?, ?, ?, ?, ?)").run(id, sceneId, assetId ?? null, x, y, ownerUserId ?? null);
    if (ownerUserId) db.prepare("INSERT INTO token_owners(token_id, user_id) VALUES (?, ?)").run(id, ownerUserId);
    const scene = db.prepare("SELECT session_id FROM scenes WHERE id = ?").get(sceneId) as { session_id: string } | undefined;
    if (scene) db.prepare("INSERT INTO character_sheets(id, session_id, token_id, name) VALUES (?, ?, ?, ?)").run(generateId("sheet"), scene.session_id, id, "Ficha");
  });
  create();
  return getToken(id)!;
}

function withOwners<T extends { id: string }>(token: T) {
  const owner_user_ids = (db.prepare("SELECT user_id FROM token_owners WHERE token_id = ? ORDER BY created_at, user_id").all(token.id) as { user_id: string }[]).map((r) => r.user_id);
  return { ...token, owner_user_ids };
}

export function setTokenOwners(tokenIds: string[], userIds: string[]) {
  const update = db.transaction(() => {
    const remove = db.prepare("DELETE FROM token_owners WHERE token_id = ?");
    const add = db.prepare("INSERT INTO token_owners(token_id, user_id) VALUES (?, ?)");
    const legacy = db.prepare("UPDATE tokens SET owner_user_id = ? WHERE id = ?");
    for (const tokenId of tokenIds) {
      remove.run(tokenId);
      for (const userId of userIds) add.run(tokenId, userId);
      legacy.run(userIds.length === 1 ? userIds[0] : null, tokenId);
    }
  });
  update();
  return tokenIds.map((id) => ({ token_id: id, owner_user_ids: (getToken(id)?.owner_user_ids ?? []) }));
}

export function getToken(id: string) {
  const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as
  | { id: string; scene_id: string; asset_id: string | null; x: number; y: number; owner_user_id: string | null }
    | undefined;
  return token ? withOwners(token) : undefined;
}

export function getTokensForScene(sceneId: string) {
  const tokens = db.prepare(
    // "SELECT * FROM tokens WHERE scene_id = ? ORDER BY id"
    "SELECT * FROM tokens WHERE scene_id = ? ORDER BY rowid"
  ).all(sceneId) as { id: string; x: number; y: number; asset_id: string | null; owner_user_id: string | null; created_at: number }[];
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
