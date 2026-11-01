import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

// Compatibilidade inicial com bancos criados antes do schema atual.
function migrateLegacySchema(db: Database.Database) {
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
  if (!tokenColumnNames.includes("owner_user_id")) {
    db.exec("ALTER TABLE tokens ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;");
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
  if (!sessionColumnNames.includes("asset_key")) {
    db.exec("ALTER TABLE sessions ADD COLUMN asset_key TEXT;");
  }

  const sceneConfigColumns: [string, string][] = [
    ["width", "REAL NOT NULL DEFAULT 2000"],
    ["height", "REAL NOT NULL DEFAULT 1500"],
    ["grid_type", "TEXT NOT NULL DEFAULT 'square'"],
    ["grid_size", "REAL NOT NULL DEFAULT 50"],
    ["grid_color", "TEXT NOT NULL DEFAULT '#ffffff'"],
    ["grid_opacity", "REAL NOT NULL DEFAULT 0.5"],
  ];
  for (const [name, def] of sceneConfigColumns) {
    if (!sceneColumnNames.includes(name)) {
      db.exec(`ALTER TABLE scenes ADD COLUMN ${name} ${def};`);
    }
  }

  const withoutKey = db.prepare("SELECT id FROM sessions WHERE asset_key IS NULL").all() as { id: string }[];
  const fillKey = db.prepare("UPDATE sessions SET asset_key = ? WHERE id = ?");
  for (const row of withoutKey) fillKey.run(randomUUID(), row.id);

  const needsMigration =
    !chatColumnNames.includes("message_type") ||
    !chatColumnNames.includes("target") ||
    !chatColumnNames.includes("metadata");

  if (!needsMigration) return;

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
}

const migrations: Migration[] = [
  { version: 1, name: "legacy-schema-compatibility", up: migrateLegacySchema },
  {
    version: 2,
    name: "scene-measurements-and-drawings",
    up(db) {
      db.exec(`
        ALTER TABLE scenes ADD COLUMN measurement_mode TEXT NOT NULL DEFAULT 'grid';
        ALTER TABLE scenes ADD COLUMN measurement_unit_label TEXT NOT NULL DEFAULT 'unidades';
        ALTER TABLE scenes ADD COLUMN measurement_units_per_cell REAL NOT NULL DEFAULT 1;
        CREATE TABLE scene_drawings (
          id TEXT PRIMARY KEY,
          scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
          owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('line', 'ellipse', 'polygon', 'freehand', 'measurement')),
          points TEXT NOT NULL,
          shared INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX scene_drawings_scene_id_idx ON scene_drawings(scene_id, created_at);
      `);
    },
  },
  {
    version: 3,
    name: "scene-measurement-snap",
    up(db) {
      db.exec("ALTER TABLE scenes ADD COLUMN measurement_snap_to_cell_centers INTEGER NOT NULL DEFAULT 0;");
    },
  },
  {
    version: 4,
    name: "multiple-token-owners",
    up(db) {
      db.exec(`
        CREATE TABLE token_owners (
          token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          PRIMARY KEY (token_id, user_id)
        );
        CREATE INDEX token_owners_user_id_idx ON token_owners(user_id);
        INSERT OR IGNORE INTO token_owners(token_id, user_id)
          SELECT id, owner_user_id FROM tokens WHERE owner_user_id IS NOT NULL;
      `);
    },
  },
  {
    version: 5,
    name: "ordered-scenes-and-member-locations",
    up(db) {
      db.exec(`
        ALTER TABLE scenes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
        UPDATE scenes SET sort_order = (SELECT COUNT(*) FROM scenes s2 WHERE s2.session_id = scenes.session_id AND s2.created_at < scenes.created_at);
        ALTER TABLE memberships ADD COLUMN current_scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL;
        CREATE INDEX memberships_current_scene_idx ON memberships(current_scene_id);
      `);
    },
  },
  {
    version: 6,
    name: "character-sheets-and-session-template",
    up(db) {
      db.exec(`
        CREATE TABLE session_sheet_templates (
          session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
          html TEXT NOT NULL DEFAULT '<h2 data-sheet-name></h2><label>Força <input data-field="strength" type="number" value="0"></label><button data-vtt-action="attack">Ataque</button>',
          css TEXT NOT NULL DEFAULT 'body{font:14px system-ui;color:#eee;background:#181a22;padding:12px}input{max-width:80px}',
          actions_json TEXT NOT NULL DEFAULT '[{"id":"attack","label":"Ataque","kind":"roll","expression":"1d20+{{strength}}"}]',
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE character_sheets (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          token_id TEXT NOT NULL UNIQUE REFERENCES tokens(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          data_json TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX character_sheets_session_idx ON character_sheets(session_id);
      `);
      const rows = db.prepare(`SELECT t.id, s.session_id FROM tokens t JOIN scenes s ON s.id=t.scene_id`).all() as { id: string; session_id: string }[];
      const insert = db.prepare("INSERT INTO character_sheets(id,session_id,token_id,name,data_json) VALUES(?,?,?,?, '{}')");
      for (const row of rows) insert.run(`sheet_${row.id}`, row.session_id, row.id, "Ficha");
    },
  },
  {
    version: 7,
    name: "sheets-own-many-scene-token-instances",
    up(db) {
      db.exec(`
        CREATE TEMP TABLE migrated_sheet_owners AS
          SELECT DISTINCT cs.id AS sheet_id, owner.user_id
          FROM character_sheets cs JOIN token_owners owner ON owner.token_id = cs.token_id;
        CREATE TABLE character_sheets_v7 (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          data_json TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO character_sheets_v7(id,session_id,name,data_json,updated_at)
          SELECT id,session_id,name,data_json,updated_at FROM character_sheets;
        ALTER TABLE tokens ADD COLUMN sheet_id TEXT REFERENCES character_sheets_v7(id) ON DELETE RESTRICT;
        UPDATE tokens SET sheet_id = (SELECT id FROM character_sheets WHERE character_sheets.token_id = tokens.id);
        CREATE TABLE character_sheet_owners_v7 (
          sheet_id TEXT NOT NULL REFERENCES character_sheets_v7(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          PRIMARY KEY(sheet_id,user_id)
        );
        INSERT OR IGNORE INTO character_sheet_owners_v7(sheet_id,user_id)
          SELECT sheet_id,user_id FROM migrated_sheet_owners;
        DROP TABLE character_sheets;
        ALTER TABLE character_sheets_v7 RENAME TO character_sheets;
        ALTER TABLE character_sheet_owners_v7 RENAME TO character_sheet_owners;
        DROP TABLE migrated_sheet_owners;
        CREATE INDEX character_sheets_session_idx ON character_sheets(session_id);
        CREATE INDEX character_sheet_owners_user_idx ON character_sheet_owners(user_id);
        CREATE INDEX tokens_sheet_id_idx ON tokens(sheet_id);
      `);
    },
  },
  {
    version: 8,
    name: "character-sheet-owns-token-image",
    up(db) {
      db.exec(`
        ALTER TABLE character_sheets ADD COLUMN image_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL;
        UPDATE character_sheets SET image_asset_id = (
          SELECT asset_id FROM tokens WHERE tokens.sheet_id = character_sheets.id AND asset_id IS NOT NULL ORDER BY rowid LIMIT 1
        );
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const hasMigration = db.prepare(
    "SELECT 1 FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = db.prepare(
    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (hasMigration.get(migration.version)) continue;

    db.transaction(() => {
      migration.up(db);
      recordMigration.run(migration.version, migration.name);
    }).immediate();
  }
}
