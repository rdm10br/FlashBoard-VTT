import type Database from "better-sqlite3";

export function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      nickname    TEXT NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      owner_id        TEXT NOT NULL REFERENCES users(id),
      active_scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
      default_token_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      max_dice_count  INTEGER NOT NULL DEFAULT 100,
      max_dice_sides  INTEGER NOT NULL DEFAULT 100,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('gm', 'player', 'viewer')),
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, session_id)
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code        TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('gm', 'player', 'viewer')),
      created_by  TEXT NOT NULL REFERENCES users(id),
      use_count   INTEGER NOT NULL DEFAULT 0,
      max_uses    INTEGER,
      expires_at  INTEGER,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      is_visible  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id          TEXT PRIMARY KEY,
      scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      asset_id    TEXT REFERENCES assets(id) ON DELETE SET NULL,
      x           REAL NOT NULL,
      y           REAL NOT NULL,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
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

    CREATE TABLE IF NOT EXISTS assets (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK(kind IN ('token_image', 'map_image', 'character_sheet')),
      filename    TEXT NOT NULL,
      path        TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      size_bytes  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}
