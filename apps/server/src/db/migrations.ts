import type Database from "better-sqlite3";

// Migração incremental: garante que chat_messages tenha as colunas
// message_type/target/metadata mesmo em bancos criados antes delas existirem.
export function runMigrations(db: Database.Database) {
  const chatColumns = db.prepare("PRAGMA table_info(chat_messages)").all();
  const chatColumnNames = chatColumns.map((col: any) => col.name);

  // Migração incremental: garante que sessions tenha max_dice_count e max_dice_sides
  const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all();
  const sessionColumnNames = sessionColumns.map((col: any) => col.name);

  if (!sessionColumnNames.includes("max_dice_count")) {
    db.exec("ALTER TABLE sessions ADD COLUMN max_dice_count INTEGER NOT NULL DEFAULT 100;");
  }

  if (!sessionColumnNames.includes("max_dice_sides")) {
    db.exec("ALTER TABLE sessions ADD COLUMN max_dice_sides INTEGER NOT NULL DEFAULT 100;");
  }

  if (!sessionColumnNames.includes("active_scene_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN active_scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL;");
  }

  if (!sessionColumnNames.includes("default_token_asset_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN default_token_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL;");
  }

  const tokenColumns = db.prepare("PRAGMA table_info(tokens)").all();
  const tokenColumnNames = tokenColumns.map((col: any) => col.name);
  if (!tokenColumnNames.includes("asset_id")) {
    db.exec("ALTER TABLE tokens ADD COLUMN asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL;");
  }

  const needsMigration =
    !chatColumnNames.includes("message_type") ||
    !chatColumnNames.includes("target") ||
    !chatColumnNames.includes("metadata");

  if (!needsMigration) return;

  db.exec("BEGIN TRANSACTION;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages_new (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sender      TEXT NOT NULL,
      text        TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      target      TEXT,
      metadata    TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  db.exec(`
    INSERT INTO chat_messages_new (id, session_id, sender, text, timestamp, message_type, target, metadata, created_at)
    SELECT id, session_id, sender, text, timestamp, 'text', NULL, NULL, created_at
    FROM chat_messages;
  `);
  db.exec(`DROP TABLE chat_messages;`);
  db.exec(`ALTER TABLE chat_messages_new RENAME TO chat_messages;`);
  db.exec("COMMIT;");
}
