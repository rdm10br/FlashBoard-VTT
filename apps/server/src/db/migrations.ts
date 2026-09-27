import type Database from "better-sqlite3";

// Migração incremental: garante que chat_messages tenha as colunas
// message_type/target/metadata mesmo em bancos criados antes delas existirem.
export function runMigrations(db: Database.Database) {
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  const userColumnNames = userColumns.map((col: any) => col.name);

  if (!userColumnNames.includes("email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT;");
  }
  if (!userColumnNames.includes("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
  }
  if (!userColumnNames.includes("is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
      ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS users_authenticated_nickname_unique
      ON users(nickname COLLATE NOCASE) WHERE password_hash IS NOT NULL;
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

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

  const sceneColumns = db.prepare("PRAGMA table_info(scenes)").all();
  const sceneColumnNames = sceneColumns.map((col: any) => col.name);
  if (!sceneColumnNames.includes("map_asset_id")) {
    db.exec("ALTER TABLE scenes ADD COLUMN map_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL;");
  }
  if (!sceneColumnNames.includes("map_x")) {
    db.exec("ALTER TABLE scenes ADD COLUMN map_x REAL NOT NULL DEFAULT 0;");
  }
  if (!sceneColumnNames.includes("map_y")) {
    db.exec("ALTER TABLE scenes ADD COLUMN map_y REAL NOT NULL DEFAULT 0;");
  }
  if (!sceneColumnNames.includes("map_scale")) {
    db.exec("ALTER TABLE scenes ADD COLUMN map_scale REAL NOT NULL DEFAULT 1;");
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
