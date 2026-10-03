import type { FastifyInstance } from "fastify";
import { consumeGrant } from "../state/grants.js";
import { getSessionBackup, importSessionBackup, type SessionBackup } from "../db/index.js";
import { BackupValidationError, parseSessionBackup, parseTargetName } from "../services/backupValidation.js";

export async function backupRoutes(app: FastifyInstance) {
  app.get("/backup/session/:session_id", async (request, reply) => {
    const session_id = (request.params as { session_id: string }).session_id;
    const token = (request.query as Record<string, string> | undefined)?.token;

    const grant = token ? consumeGrant(token, "export", session_id) : undefined;
    if (!grant) {
      reply.code(401);
      return { error: "Token de exportação inválido, expirado ou já utilizado." };
    }

    const backup = getSessionBackup(session_id);
    if (!backup) {
      reply.code(404);
      return { error: "Sessão não encontrada." };
    }

    const safeName = backup.session_name.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = `vtt-backup-${safeName}-${Date.now()}.json`;

    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.type("application/json");
    return backup;
  });

  app.post("/backup/session/import", { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const token = (request.query as Record<string, string> | undefined)?.token;

    const grant = token ? consumeGrant(token, "import") : undefined;
    if (!grant) {
      reply.code(401);
      return { error: "Token de importação inválido, expirado ou já utilizado." };
    }

    let backup: SessionBackup;
    let targetName: string | undefined;
    try {
      backup = parseSessionBackup(request.body);
      targetName = parseTargetName(request.body);
    } catch (error) {
      if (error instanceof BackupValidationError) {
        reply.code(400);
        return { error: error.message };
      }
      throw error;
    }

    const result = importSessionBackup(backup, targetName, grant.user_id);
    return { session_id: result.session.id, session_name: result.session.name, invite_codes: result.invite_codes };
  });
}
