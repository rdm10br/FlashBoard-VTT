import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const DATA_DIR = process.env.VTT_DATA_DIR
  ? path.resolve(process.env.VTT_DATA_DIR)
  : path.join(__dirname, "../../../../../data");
const DB_PATH = path.join(DATA_DIR, "vtt.db");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function closeDatabase(): void {
  db.close();
}

export default db;