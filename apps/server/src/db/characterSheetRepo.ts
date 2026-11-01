import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { CharacterSheet } from "@vtt/protocol";

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

export type StoredCharacterSheet = CharacterSheet & { session_id: string };

export function getCharacterSheet(id: string): StoredCharacterSheet | undefined {
  const row = db.prepare("SELECT id,session_id,name,data_json FROM character_sheets WHERE id=?").get(id) as { id: string; session_id: string; name: string; data_json: string } | undefined;
  if (!row) return undefined;
  const owners = db.prepare("SELECT user_id FROM character_sheet_owners WHERE sheet_id=? ORDER BY created_at,user_id").all(row.id) as { user_id: string }[];
  const tokens = db.prepare(`SELECT t.id AS token_id,t.scene_id,s.name AS scene_name,t.x,t.y FROM tokens t
    JOIN scenes s ON s.id=t.scene_id WHERE t.sheet_id=? ORDER BY s.sort_order,s.created_at,t.rowid`).all(row.id) as StoredCharacterSheet["tokens"];
  return { id: row.id, session_id: row.session_id, name: row.name, data: JSON.parse(row.data_json) as Record<string, string>, owner_user_ids: owners.map((owner) => owner.user_id), tokens };
}

export function getCharacterSheets(sessionId: string): StoredCharacterSheet[] {
  const unattached = db.prepare("SELECT t.id AS token_id,s.session_id FROM tokens t JOIN scenes s ON s.id=t.scene_id WHERE s.session_id=? AND t.sheet_id IS NULL").all(sessionId) as { token_id: string; session_id: string }[];
  const repair = db.transaction(() => {
    const addSheet = db.prepare("INSERT INTO character_sheets(id,session_id,name) VALUES(?,?, 'Ficha')");
    const attach = db.prepare("UPDATE tokens SET sheet_id=? WHERE id=? AND sheet_id IS NULL");
    for (const row of unattached) { const id = generateId("sheet"); addSheet.run(id, row.session_id); attach.run(id, row.token_id); }
  });
  repair();
  const rows = db.prepare("SELECT id FROM character_sheets WHERE session_id=? ORDER BY rowid").all(sessionId) as { id: string }[];
  return rows.map((row) => getCharacterSheet(row.id)).filter((row): row is StoredCharacterSheet => !!row);
}

export function createCharacterSheet(sessionId: string, name: string) {
  const id = generateId("sheet");
  db.prepare("INSERT INTO character_sheets(id,session_id,name) VALUES(?,?,?)").run(id, sessionId, name);
  return getCharacterSheet(id)!;
}

export function setSheetOwners(sheetId: string, userIds: string[]) {
  const update = db.transaction(() => {
    db.prepare("DELETE FROM character_sheet_owners WHERE sheet_id=?").run(sheetId);
    const add = db.prepare("INSERT INTO character_sheet_owners(sheet_id,user_id) VALUES(?,?)");
    for (const userId of userIds) add.run(sheetId, userId);
  });
  update();
  return getCharacterSheet(sheetId)!;
}

export function updateCharacterSheet(id: string, name: string, data: Record<string, string>) {
  db.prepare("UPDATE character_sheets SET name=?, data_json=?, updated_at=unixepoch() WHERE id=?").run(name, JSON.stringify(data), id);
}

export function deleteCharacterSheet(id: string) {
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM tokens WHERE sheet_id=?").run(id);
    db.prepare("DELETE FROM character_sheets WHERE id=?").run(id);
  });
  remove();
}
