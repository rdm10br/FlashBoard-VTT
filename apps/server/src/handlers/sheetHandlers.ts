import type { ClientMessage, SheetAction, SheetTemplate } from "@vtt/protocol";
import { LIMITS } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { createCharacterSheet, getCharacterSheet, getCharacterSheets, getMembersForSession, getSheetTemplate, setSheetOwners, setSheetTemplate, updateCharacterSheet } from "../db/index.js";
import { clientRegistry } from "../clientRegistry.js";
import { broadcastToScene, broadcastToSession, send, sendToSessionMembers } from "../ws/broadcast.js";
import { handleChatCommand } from "../services/chatService.js";

function canReadSheet(sheet: { owner_user_ids: string[] }, state: HandlerContext["state"]) {
  return state.role === "gm" || (state.role === "player" && !!state.user_id && sheet.owner_user_ids.includes(state.user_id));
}

function sanitizeHtml(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|form|meta|base|link)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(iframe|object|embed|form|meta|base|link)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:href|src|xlink:href)\s*=\s*(["'])\s*(?:javascript:|https?:)[\s\S]*?\1/gi, "");
}

function accessibleSheets(ctx: HandlerContext) {
  return getCharacterSheets(ctx.state.session_id!).filter((sheet) => canReadSheet(sheet, ctx.state));
}

function sendSheetList(ctx: HandlerContext) {
  const sheets = accessibleSheets(ctx);
  const template = ctx.state.role === "gm" || sheets.length ? getSheetTemplate(ctx.state.session_id!) : { html: "", css: "", actions: [] };
  send(ctx.ws, { type: "SHEETS_LIST", payload: { session_id: ctx.state.session_id!, template, sheets } });
}

export function refreshAccessibleSheetLists(sessionId: string) {
  const all = getCharacterSheets(sessionId); const template = getSheetTemplate(sessionId);
  for (const client of clientRegistry.inSession(sessionId)) {
    const sheets = all.filter((sheet) => client.role === "gm" || (client.role === "player" && !!client.user_id && sheet.owner_user_ids.includes(client.user_id)));
    send(client.ws, { type: "SHEETS_LIST", payload: { session_id: sessionId, template: client.role === "gm" || sheets.length ? template : { html: "", css: "", actions: [] }, sheets } });
  }
}

function handleSheetsList(_payload: {}, ctx: HandlerContext) { sendSheetList(ctx); }

function handleSheetCreate(payload: { name: string }, ctx: HandlerContext) {
  if (ctx.state.role !== "gm") { send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode criar fichas." } }); return; }
  const sheet = createCharacterSheet(ctx.state.session_id!, payload.name.trim().slice(0, LIMITS.name) || "Ficha");
  send(ctx.ws, { type: "SHEET_CHANGED", payload: { sheet } });
  refreshAccessibleSheetLists(ctx.state.session_id!);
}

function handleSheetOwnersSet(payload: { sheet_id: string; owner_user_ids: string[] }, ctx: HandlerContext) {
  if (ctx.state.role !== "gm") { send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode alterar os owners da ficha." } }); return; }
  const sheet = getCharacterSheet(payload.sheet_id);
  if (!sheet || sheet.session_id !== ctx.state.session_id) return;
  const owners = [...new Set(payload.owner_user_ids)];
  const members = getMembersForSession(ctx.state.session_id!);
  if (owners.some((id) => !members.some((member) => member.id === id && member.role === "player"))) {
    send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "Owners devem ser jogadores desta sessão." } }); return;
  }
  const updated = setSheetOwners(sheet.id, owners);
  const byScene = new Map<string, string[]>();
  for (const token of updated.tokens) byScene.set(token.scene_id, [...(byScene.get(token.scene_id) ?? []), token.token_id]);
  for (const [sceneId, tokenIds] of byScene) {
    const tokens = tokenIds.map((token_id) => ({ token_id, owner_user_ids: owners }));
    broadcastToScene(sceneId, { type: "TOKEN_OWNERS_CHANGED", payload: { scene_id: sceneId, tokens } });
  }
  refreshAccessibleSheetLists(ctx.state.session_id!);
}

function handleTemplateSet(payload: SheetTemplate, ctx: HandlerContext) {
  if (ctx.state.role !== "gm") { send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "Apenas o mestre pode editar o modelo das fichas." } }); return; }
  if (!payload.html.trim() || payload.html.length > 100_000 || payload.css.length > 100_000 || payload.actions.length > 100 || new Set(payload.actions.map((a) => a.id)).size !== payload.actions.length) {
    send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "Modelo de ficha inválido." } }); return;
  }
  const template = { ...payload, html: sanitizeHtml(payload.html), css: payload.css.replace(/<\/style/gi, "<\\/style") };
  setSheetTemplate(ctx.state.session_id!, template);
  const sheets = getCharacterSheets(ctx.state.session_id!);
  for (const client of clientRegistry.inSession(ctx.state.session_id!)) {
    if (client.role === "gm" || (client.user_id && sheets.some((sheet) => sheet.owner_user_ids.includes(client.user_id!)))) {
      send(client.ws, { type: "SHEET_TEMPLATE_CHANGED", payload: { session_id: ctx.state.session_id!, template } });
    }
  }
}

function handleSheetUpdate(payload: { id: string; name: string; data: Record<string, string> }, ctx: HandlerContext) {
  const sheet = getCharacterSheet(payload.id);
  if (!sheet || sheet.session_id !== ctx.state.session_id || !canReadSheet(sheet, ctx.state)) return;
  const template = getSheetTemplate(sheet.session_id);
  const allowedFields = new Set([...template.html.matchAll(/data-field\s*=\s*["']([a-zA-Z0-9_-]{1,80})["']/g)].map((m) => m[1]));
  const data = Object.fromEntries(Object.entries(payload.data).filter(([key, value]) => allowedFields.has(key) && value.length <= 2000));
  const name = payload.name.trim().slice(0, LIMITS.name) || "Ficha";
  updateCharacterSheet(sheet.id, name, data);
  const updated = getCharacterSheet(sheet.id)!;
  for (const client of clientRegistry.inSession(sheet.session_id)) {
    if (client.role === "gm" || (client.user_id && updated.owner_user_ids.includes(client.user_id))) send(client.ws, { type: "SHEET_CHANGED", payload: { sheet: updated } });
  }
}

function fillTemplate(value: string, sheet: NonNullable<ReturnType<typeof getCharacterSheet>>, numericOnly: boolean) {
  let valid = true;
  const result = value.replace(/\{\{\s*([a-zA-Z0-9_-]{1,80})\s*\}\}/g, (_match, key: string) => {
    if (key === "name") return sheet.name;
    const item = sheet.data[key];
    if (item === undefined) { valid = false; return ""; }
    if (numericOnly && !/^-?\d+(?:\.\d+)?$/.test(item.trim())) { valid = false; return ""; }
    return item;
  });
  return valid ? result : null;
}

function handleSheetAction(payload: { sheet_id: string; action_id: string; data: Record<string, string> }, ctx: HandlerContext) {
  let sheet = getCharacterSheet(payload.sheet_id);
  if (!sheet || sheet.session_id !== ctx.state.session_id || !canReadSheet(sheet, ctx.state)) return;
  const allowedFields = new Set([...getSheetTemplate(sheet.session_id).html.matchAll(/data-field\s*=\s*["']([a-zA-Z0-9_-]{1,80})["']/g)].map((m) => m[1]));
  const data = Object.fromEntries(Object.entries(payload.data).filter(([key, value]) => allowedFields.has(key) && value.length <= 2000));
  updateCharacterSheet(sheet.id, sheet.name, data);
  sheet = getCharacterSheet(sheet.id)!;
  const action = getSheetTemplate(sheet.session_id).actions.find((item) => item.id === payload.action_id) as SheetAction | undefined;
  if (!action) return;
  if (action.kind === "roll") {
    const expression = fillTemplate(action.expression ?? "", sheet, true);
    if (!expression) { send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "Preencha os atributos numéricos necessários para esta rolagem." } }); return; }
    handleChatCommand(`/roll ${expression} ${sheet.name} — ${action.label}`, ctx.state.session_id!, { nickname: ctx.state.nickname, role: ctx.state.role }, ctx.ws, (message) => send(ctx.ws, message), (sessionId, message) => broadcastToSession(sessionId, message), (sessionId, names, message) => sendToSessionMembers(sessionId, names, message), (sessionId, message) => broadcastToSession(sessionId, message));
    return;
  }
  if (action.kind === "chat") {
    const text = fillTemplate(action.text ?? "", sheet, false);
    if (!text || text.startsWith("/") || text.length > LIMITS.chatText) { send(ctx.ws, { type: "SESSION_ERROR", payload: { message: "A mensagem desta ação é inválida." } }); return; }
    handleChatCommand(`${sheet.name}: ${text}`, ctx.state.session_id!, { nickname: ctx.state.nickname, role: ctx.state.role }, ctx.ws, (message) => send(ctx.ws, message), (sessionId, message) => broadcastToSession(sessionId, message), (sessionId, names, message) => sendToSessionMembers(sessionId, names, message), (sessionId, message) => broadcastToSession(sessionId, message));
    return;
  }
  if (action.kind === "map" && action.operation === "ping") {
    const token = sheet.tokens.find((item) => item.scene_id === ctx.state.scene_id) ?? sheet.tokens[0];
    if (token) broadcastToScene(token.scene_id, { type: "MAP_PING", payload: { scene_id: token.scene_id, x: token.x, y: token.y, label: action.label, nickname: ctx.state.nickname } });
  }
}

export const sheetHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  SHEETS_LIST_REQUEST: handleSheetsList,
  SHEET_CREATE: handleSheetCreate,
  SHEET_OWNERS_SET: handleSheetOwnersSet,
  SHEET_TEMPLATE_SET: handleTemplateSet,
  SHEET_UPDATE: handleSheetUpdate,
  SHEET_ACTION: handleSheetAction,
};
