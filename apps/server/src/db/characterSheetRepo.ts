import db from "./connection.js";
import { generateId } from "./idGenerators.js";

export type SheetAction = { id: string; label: string; kind: "roll" | "chat" | "map"; expression?: string; text?: string; operation?: "ping" };
export type SheetTemplate = { html: string; css: string; actions: SheetAction[] };

const DEFAULT_TEMPLATE: SheetTemplate = {
  html: '<h2 data-sheet-name></h2><label>Força <input data-field="strength" type="number" value="0"></label><button data-vtt-action="attack">Ataque</button>',
  css: "body{font:14px system-ui;color:#eee;background:#181a22;padding:12px}input{max-width:80px}button{margin:8px}",
  actions: [{ id: "attack", label: "Ataque", kind: "roll", expression: "1d20+{{strength}}" }],
};

export function getSheetTemplate(sessionId: string): SheetTemplate {
  const row = db.prepare("SELECT html, css, actions_json FROM session_sheet_templates WHERE session_id = ?").get(sessionId) as { html: string; css: string; actions_json: string } | undefined;
  return row ? { html: row.html, css: row.css, actions: JSON.parse(row.actions_json) as SheetAction[] } : DEFAULT_TEMPLATE;
}

export function setSheetTemplate(sessionId: string, template: SheetTemplate) {
  db.prepare(`INSERT INTO session_sheet_templates(session_id,html,css,actions_json,updated_at) VALUES(?,?,?,?,unixepoch())
    ON CONFLICT(session_id) DO UPDATE SET html=excluded.html,css=excluded.css,actions_json=excluded.actions_json,updated_at=unixepoch()`)
    .run(sessionId, template.html, template.css, JSON.stringify(template.actions));
}

export type CharacterSheet = { id: string; session_id: string; token_id: string; scene_id: string; x: number; y: number; name: string; data: Record<string, string>; owner_user_ids: string[] };

export function getCharacterSheet(id: string): CharacterSheet | undefined {
  const row = db.prepare(`SELECT cs.*, t.scene_id,t.x,t.y FROM character_sheets cs JOIN tokens t ON t.id=cs.token_id WHERE cs.id=?`).get(id) as (Omit<CharacterSheet, "data" | "owner_user_ids"> & { data_json: string }) | undefined;
  if (!row) return undefined;
  const owners = db.prepare("SELECT user_id FROM token_owners WHERE token_id=? ORDER BY user_id").all(row.token_id) as { user_id: string }[];
  const { data_json, ...sheet } = row;
  return { ...sheet, data: JSON.parse(data_json) as Record<string, string>, owner_user_ids: owners.map((owner) => owner.user_id) };
}

export function getCharacterSheets(sessionId: string): CharacterSheet[] {
  db.prepare(`INSERT OR IGNORE INTO character_sheets(id,session_id,token_id,name)
    SELECT 'sheet_' || t.id, s.session_id, t.id, 'Ficha' FROM tokens t JOIN scenes s ON s.id=t.scene_id WHERE s.session_id=?`).run(sessionId);
  const rows = db.prepare("SELECT id FROM character_sheets WHERE session_id=? ORDER BY rowid").all(sessionId) as { id: string }[];
  return rows.map((row) => getCharacterSheet(row.id)).filter((row): row is CharacterSheet => !!row);
}

export function updateCharacterSheet(id: string, name: string, data: Record<string, string>) {
  db.prepare("UPDATE character_sheets SET name=?, data_json=?, updated_at=unixepoch() WHERE id=?").run(name, JSON.stringify(data), id);
}

export function createSheetForToken(sessionId: string, tokenId: string) {
  db.prepare("INSERT OR IGNORE INTO character_sheets(id,session_id,token_id,name) VALUES(?,?,?,?)").run(generateId("sheet"), sessionId, tokenId, "Ficha");
}
