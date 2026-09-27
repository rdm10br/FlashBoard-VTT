import type { ClientMessage } from "@vtt/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { getSessionsForUser } from "../db/index.js";
import { getUserByIdForAdmin, listAdminUsers } from "../db/userRepo.js";
import { send } from "../ws/broadcast.js";
import { clientRegistry } from "../clientRegistry.js";
import {
  authenticate,
  hashPassword,
  isAdminBootstrapAvailable,
  registerAccount,
  resumeAuthentication,
  revokeAuthSession,
  updateAccountCredentials,
} from "../services/authService.js";

function handlePing(_payload: string, _ctx: HandlerContext) {}

function validateCredentials(email: unknown, nickname: unknown, password: unknown): string | null {
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return "Informe um e-mail válido.";
  }
  if (typeof nickname !== "string" || nickname.trim().length < 2 || nickname.trim().length > 32) {
    return "O apelido deve ter entre 2 e 32 caracteres.";
  }
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 128) {
    return "A senha deve ter entre 12 e 128 bytes.";
  }
  return null;
}

function sendUserState(
  state: HandlerContext["state"],
  user: { id: string; nickname: string; is_admin: boolean },
  token: string,
) {
  state.user_id = user.id;
  state.nickname = user.nickname;
  state.auth_token = token;
  state.is_admin = user.is_admin;
  send(state.ws, {
    type: "USER_STATE",
    payload: {
      user_id: user.id,
      nickname: user.nickname,
      sessions: getSessionsForUser(user.id),
      auth_token: token,
      is_admin: user.is_admin,
    },
  });
}

async function handleUserRegister(
  payload: Extract<ClientMessage, { type: "USER_REGISTER" }>["payload"],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (state.user_id) {
    send(ws, { type: "USER_ERROR", payload: { message: "Encerre a sessão atual antes de criar outra conta." } });
    return;
  }

  const validationError = validateCredentials(payload?.email, payload?.nickname, payload?.password);
  if (validationError) {
    send(ws, { type: "USER_ERROR", payload: { message: validationError } });
    return;
  }
  if (
    payload.bootstrap_token !== undefined &&
    (typeof payload.bootstrap_token !== "string" || payload.bootstrap_token.length > 256)
  ) {
    send(ws, { type: "USER_ERROR", payload: { message: "Código de administrador inválido." } });
    return;
  }

  try {
    const result = await registerAccount({
      email: payload.email,
      nickname: payload.nickname,
      password: payload.password,
      bootstrapToken: payload.bootstrap_token,
    });
    sendUserState(state, result.user, result.token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar a conta.";
    send(ws, { type: "USER_ERROR", payload: { message } });
  }
}

async function handleUserLogin(
  payload: Extract<ClientMessage, { type: "USER_LOGIN" }>["payload"],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (state.user_id) {
    send(ws, { type: "USER_ERROR", payload: { message: "Encerre a sessão atual antes de entrar em outra conta." } });
    return;
  }
  if (
    !payload ||
    typeof payload.identifier !== "string" ||
    !payload.identifier.trim() ||
    payload.identifier.length > 254 ||
    typeof payload.password !== "string" ||
    Buffer.byteLength(payload.password, "utf8") > 128
  ) {
    send(ws, { type: "USER_ERROR", payload: { message: "Informe e-mail ou apelido e senha." } });
    return;
  }

  const result = await authenticate(
    payload.identifier,
    payload.password,
    state.auth_client_key,
  );
  if (!result) {
    send(ws, { type: "USER_ERROR", payload: { message: "Credenciais inválidas. Contas antigas precisam ser associadas por um administrador." } });
    return;
  }
  sendUserState(state, result.user, result.token);
}

function handleUserResume(
  payload: Extract<ClientMessage, { type: "USER_RESUME" }>["payload"],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (state.user_id) return;
  if (!payload || typeof payload.token !== "string" || payload.token.length < 32) {
    send(ws, { type: "USER_ERROR", payload: { message: "Sessão de autenticação inválida." } });
    return;
  }

  const result = resumeAuthentication(payload.token);
  if (!result) {
    send(ws, { type: "USER_ERROR", payload: { message: "Sessão expirada. Entre novamente com sua senha." } });
    return;
  }
  sendUserState(state, result.user, result.token);
}

function handleUserLogout(_payload: {}, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.auth_token) revokeAuthSession(state.auth_token);
  clientRegistry.clearAuthentication(state);
  send(ws, { type: "USER_LOGGED_OUT", payload: {} });
}

function handleAdminListUsers(_payload: {}, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (!state.is_admin) {
    send(ws, { type: "USER_ERROR", payload: { message: "Apenas administradores podem gerenciar contas." } });
    return;
  }
  send(ws, { type: "ADMIN_USERS", payload: { users: listAdminUsers() } });
}

async function handleAdminSetUserCredentials(
  payload: Extract<ClientMessage, { type: "ADMIN_SET_USER_CREDENTIALS" }>["payload"],
  ctx: HandlerContext,
) {
  const { state, ws } = ctx;
  if (!state.is_admin) {
    send(ws, { type: "USER_ERROR", payload: { message: "Apenas administradores podem gerenciar contas." } });
    return;
  }
  const validationError = validateCredentials(
    payload?.email,
    getUserByIdForAdmin(payload?.user_id ?? "")?.nickname,
    payload?.password,
  );
  if (!payload || typeof payload.user_id !== "string" || !getUserByIdForAdmin(payload.user_id)) {
    send(ws, { type: "USER_ERROR", payload: { message: "Conta não encontrada." } });
    return;
  }
  if (validationError) {
    send(ws, { type: "USER_ERROR", payload: { message: validationError } });
    return;
  }
  const passwordHash = await hashPassword(payload.password);
  try {
    if (!updateAccountCredentials(payload.user_id, payload.email, passwordHash)) {
      send(ws, { type: "USER_ERROR", payload: { message: "Não foi possível atualizar a conta." } });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar as credenciais.";
    send(ws, { type: "USER_ERROR", payload: { message } });
    return;
  }

  send(ws, { type: "ADMIN_USERS", payload: { users: listAdminUsers() } });
  for (const client of clientRegistry.inUser(payload.user_id)) {
    client.ws.close(4001, "Credenciais alteradas pelo administrador");
  }
}

export const userHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  PING: handlePing,
  USER_REGISTER: handleUserRegister,
  USER_LOGIN: handleUserLogin,
  USER_RESUME: handleUserResume,
  USER_LOGOUT: handleUserLogout,
  ADMIN_LIST_USERS: handleAdminListUsers,
  ADMIN_SET_USER_CREDENTIALS: handleAdminSetUserCredentials,
};

export { isAdminBootstrapAvailable };
