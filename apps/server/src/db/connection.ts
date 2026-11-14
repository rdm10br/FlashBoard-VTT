import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Recria o __dirname de forma segura para ESM e multiplataforma
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getDataDir(): string {
  return process.env.VTT_DATA_DIR
    ? path.resolve(process.env.VTT_DATA_DIR)
    : path.join(__dirname, "../../../../../data");
}

export const DATA_DIR = getDataDir();

let currentDb: Database.Database | null = null;
let currentDbPath: string | null = null;

export function getActiveDb(): Database.Database {
  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, "vtt.db");

  if (!currentDb || !currentDb.open || currentDbPath !== dbPath) {
    if (currentDb && currentDb.open) {
      try {
        currentDb.close();
      } catch {}
    }
    fs.mkdirSync(dataDir, { recursive: true });
    currentDb = new Database(dbPath);
    currentDb.pragma("journal_mode = WAL");
    currentDb.pragma("foreign_keys = ON");
    currentDbPath = dbPath;
  }
  return currentDb;
}

export function closeDatabase(): void {
  if (currentDb && currentDb.open) {
    currentDb.close();
  }
}

const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const active = getActiveDb();
    const value = Reflect.get(active, prop, active);
    if (typeof value === "function") {
      return value.bind(active);
    }
    return value;
  },
  set(_target, prop, value) {
    const active = getActiveDb();
    return Reflect.set(active, prop, value, active);
  },
  has(_target, prop) {
    const active = getActiveDb();
    return Reflect.has(active, prop);
  },
});

export default db;
