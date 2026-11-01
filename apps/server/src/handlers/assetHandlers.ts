import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { deleteAsset, getAsset, getAssetsForSession } from "../db/index.js";
import { UPLOADS_DIR } from "../storage/uploads.js";
import { broadcastToScene, broadcastToSession, send } from "../ws/broadcast.js";
import { issueGrant } from "../state/grants.js";
import fs from "node:fs/promises";
import path from "node:path";

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

function sendAssetError(ws: HandlerContext["ws"], message: string) {
  send(ws, { type: "ASSET_ERROR", payload: { message } });
}

function handleAssetListRequest(payload: { session_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") {
    sendAssetError(ws, "Apenas o mestre pode gerenciar os arquivos da sessão.");
    return;
  }
  if (!payload?.session_id || payload.session_id !== state.session_id) {
    sendAssetError(ws, "Sessão inválida para listar arquivos.");
    return;
  }

  const assets = getAssetsForSession(state.session_id!).flatMap((asset) => {
    if (asset.kind !== "token_image" && asset.kind !== "map_image") return [];
    return [{
      id: asset.id,
      kind: asset.kind,
      filename: asset.filename,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      created_at: asset.created_at,
    }];
  });
  send(ws, { type: "ASSET_LIST", payload: { session_id: state.session_id!, assets } });
}

async function handleAssetDeleteRequest(payload: { asset_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role !== "gm") {
    sendAssetError(ws, "Apenas o mestre pode excluir arquivos da sessão.");
    return;
  }
  if (!payload?.asset_id || typeof payload.asset_id !== "string") {
    sendAssetError(ws, "Arquivo inválido.");
    return;
  }

  const asset = getAsset(payload.asset_id);
  if (!asset || asset.session_id !== state.session_id || (asset.kind !== "token_image" && asset.kind !== "map_image")) {
    sendAssetError(ws, "Arquivo não encontrado nesta sessão.");
    return;
  }

  const deleted = deleteAsset(asset.id);
  if (!deleted) {
    sendAssetError(ws, "O arquivo já foi removido.");
    return;
  }

  for (const token of deleted.tokenReferences) {
    broadcastToScene(token.scene_id, {
      type: "TOKEN_ASSET_CHANGED",
      payload: { id: token.id, asset_id: null },
    });
  }
  for (const scene_id of deleted.mapSceneIds) {
    broadcastToScene(scene_id, { type: "SCENE_MAP_CHANGED", payload: { scene_id, map: null } });
  }
  if (deleted.clearsDefaultToken) {
    broadcastToSession(asset.session_id, {
      type: "SESSION_DEFAULT_TOKEN_ASSET_CHANGED",
      payload: { asset_id: null },
    });
  }

  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const filePath = path.resolve(uploadsRoot, deleted.asset.path);
  if (path.dirname(filePath) === uploadsRoot) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Asset removido do banco, mas não foi possível excluir o arquivo:", error);
      }
    }
  } else {
    console.error("Caminho de asset fora do diretório de uploads; arquivo não removido.");
  }

  broadcastToSession(asset.session_id, {
    type: "ASSET_DELETED",
    payload: { session_id: asset.session_id, asset_id: asset.id },
  });
}

export const assetHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  ASSET_UPLOAD_GRANT_REQUEST: handleAssetUploadGrantRequest,
  ASSET_LIST_REQUEST: handleAssetListRequest,
  ASSET_DELETE_REQUEST: handleAssetDeleteRequest,
};
