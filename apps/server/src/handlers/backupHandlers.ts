import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { send } from "../ws/broadcast.js";
import { issueGrant } from "../state/grants.js";

function handleBackupExportRequest(payload: { session_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;

  if (state.role !== "gm") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode exportar o backup da sessão." } });
    return;
  }
  if (!payload?.session_id || payload.session_id !== state.session_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Sessão inválida para exportação." } });
    return;
  }

  const { token, expires_at } = issueGrant("export", state.user_id!, payload.session_id);
  send(ws, { type: "BACKUP_GRANT_ISSUED", payload: { token, expires_at, kind: "export" } });
}

function handleBackupImportGrantRequest(_payload: unknown, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const { token, expires_at } = issueGrant("import", state.user_id!, null);
  send(ws, { type: "BACKUP_GRANT_ISSUED", payload: { token, expires_at, kind: "import" } });
}

export const backupHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  BACKUP_EXPORT_REQUEST: handleBackupExportRequest,
  BACKUP_IMPORT_GRANT_REQUEST: handleBackupImportGrantRequest,
};