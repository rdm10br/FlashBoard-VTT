import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { consumeGrant } from "../state/grants.js";
import { UPLOADS_DIR, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "../storage/uploads.js";
import { createAsset, getAsset, getSession } from "../db/index.js";

export async function assetRoutes(app: FastifyInstance) {
  app.post("/api/assets/upload", async (request, reply) => {
    const query = request.query as Record<string, string> | undefined;
    const token = query?.token;
    const session_id = query?.session_id;
    const kind = query?.kind;

    if (kind !== "token_image" && kind !== "map_image") {
      reply.code(400);
      return { error: "Tipo de asset inválido." };
    }

    const grant =
      token && session_id
        ? consumeGrant(token, "asset_upload", session_id, kind)
        : undefined;
    if (!grant || !session_id) {
      reply.code(401);
      return { error: "Token de upload inválido, expirado ou já utilizado." };
    }

    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Nenhum arquivo enviado." };
    }

    const extension = ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      reply.code(415);
      return { error: `Tipo de arquivo não permitido: ${file.mimetype}` };
    }

    const diskName = `${randomUUID()}${extension}`;
    const diskPath = path.join(UPLOADS_DIR, diskName);

    try {
      await pipeline(file.file, createWriteStream(diskPath));
    } catch {
      await fs.promises.unlink(diskPath).catch(() => {});
      reply.code(500);
      return { error: "Falha ao salvar o arquivo." };
    }

    if (file.file.truncated) {
      await fs.promises.unlink(diskPath).catch(() => {});
      reply.code(413);
      return { error: `Arquivo excede o limite de ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` };
    }

    const stats = await fs.promises.stat(diskPath);

    const asset = createAsset({
      sessionId: session_id,
      kind,
      filename: file.filename,
      path: diskName,
      mimeType: file.mimetype,
      sizeBytes: stats.size,
    });

    return { id: asset.id, filename: asset.filename, size_bytes: asset.size_bytes };
  });

  app.get("/api/assets/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const key = (request.query as Record<string, string> | undefined)?.key;

    const asset = getAsset(id);
    if (!asset) {
      reply.code(404);
      return { error: "Asset não encontrado." };
    }

    const session = getSession(asset.session_id);
    if (!session || !key || key !== session.asset_key) {
      reply.code(401);
      return { error: "Acesso não autorizado a este asset." };
    }

    const filePath = path.join(UPLOADS_DIR, asset.path);
    reply.type(asset.mime_type);
    return reply.send(fs.createReadStream(filePath));
  });
}
