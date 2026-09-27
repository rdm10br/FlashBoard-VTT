import db from "./connection.js";
import { createSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";

export function initDb() {
  createSchema(db);
  runMigrations(db);
}

// Roda automaticamente na importação — mantém paridade com o comportamento
// anterior (db.ts antigo executava schema+migração no top-level ao ser importado).
initDb();

export * from "./types.js";
export * from "./userRepo.js";
export * from "./sessionRepo.js";
export * from "./membershipRepo.js";
export * from "./inviteRepo.js";
export * from "./sceneRepo.js";
export * from "./tokenRepo.js";
export * from "./chatRepo.js";
export * from "./backupRepo.js";
export * from "./assetRepo.js";

export default db;