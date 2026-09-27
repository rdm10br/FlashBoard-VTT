import path from "path";
import fs from "fs";
import { DATA_DIR } from "../db/connection.js";

export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Lista branca por conteúdo (mimetype detectado), não por extensão do nome enviado.
// Ficha em HTML (character_sheet) fica de fora por enquanto — entra na D4, com sandbox.
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — provisório, revisado na D6