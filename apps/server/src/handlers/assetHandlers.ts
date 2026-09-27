import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { send } from "../ws/broadcast.js";
import { issueGrant } from "../state/grants.js";

function handleAssetUploadGrantRequest(
  payload: { session_id: string; asset_kind?: "token_image" | "map_image" },
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;

  if (!payload?.session_id || payload.session_id !== state.session_id) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Sessão inválida para upload." } });
    return;
  }
  const assetKind = payload.asset_kind ?? "token_image";
  if (assetKind !== "token_image" && assetKind !== "map_image") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Tipo de arquivo inválido." } });
    return;
  }
  if (assetKind === "map_image" && state.role !== "gm") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode enviar mapas." } });
    return;
  }
  if (assetKind === "token_image" && state.role === "viewer") {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Visualizadores não podem enviar arquivos." } });
    return;
  }

  const { token, expires_at } = issueGrant("asset_upload", state.user_id!, payload.session_id, assetKind);
  send(ws, {
    type: "BACKUP_GRANT_ISSUED",
    payload: { token, expires_at, kind: "asset_upload", asset_kind: assetKind },
  });
}

export const assetHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  ASSET_UPLOAD_GRANT_REQUEST: handleAssetUploadGrantRequest,
};