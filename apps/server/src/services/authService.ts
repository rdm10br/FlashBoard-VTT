import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import db from "../db/connection.js";
import {
  createAccount,
  accountIdentityAvailable,
  accountCredentialsAvailable,
  getUserByIdForAdmin,
  getUserForLogin,
  hasAdminAccount,
  setUserCredentials,
} from "../db/userRepo.js";

const PASSWORD_KEY_LENGTH = 64;
const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 10;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const loginFailures = new Map<string, { count: number; resetAt: number }>();

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivePassword(password, salt);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltHex, keyHex] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    cost !== "16384" ||
    blockSize !== "8" ||
    parallelism !== "1" ||
    !saltHex ||
    !/^[0-9a-f]{32}$/i.test(saltHex) ||
    !keyHex ||
    !/^[0-9a-f]{128}$/i.test(keyHex)
  ) {
    return false;
  }

  const actual = await derivePassword(password, Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(keyHex, "hex");
  return timingSafeEqual(actual, expected);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createAuthSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + AUTH_SESSION_TTL_SECONDS;
  db.prepare("DELETE FROM auth_sessions WHERE expires_at <= unixepoch()").run();
  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), userId, hashAuthToken(token), expiresAt);
  return token;
}

export function isAdminBootstrapAvailable(): boolean {
  const secret = process.env.ADMIN_BOOTSTRAP_TOKEN;
  return !hasAdminAccount() && typeof secret === "string" && secret.length >= 32;
}

function matchesBootstrapToken(token: string | undefined): boolean {
  const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!token || !configuredToken || configuredToken.length < 32) return false;
  const supplied = Buffer.from(token);
  const configured = Buffer.from(configuredToken);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export async function registerAccount(input: {
  email: string;
  nickname: string;
  password: string;
  bootstrapToken?: string;
}) {
  const email = normalizeEmail(input.email);
  if (!accountIdentityAvailable(email, input.nickname.trim())) {
    throw new Error("E-mail ou apelido já está vinculado a uma conta.");
  }
  const passwordHash = await hashPassword(input.password);
  const token = randomBytes(32).toString("base64url");
  const authTokenHash = hashAuthToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + AUTH_SESSION_TTL_SECONDS;

  const create = db.transaction(() => {
    if (!accountIdentityAvailable(email, input.nickname.trim())) {
      throw new Error("E-mail ou apelido já está vinculado a uma conta.");
    }
    let isAdmin = false;
    if (input.bootstrapToken) {
      if (!matchesBootstrapToken(input.bootstrapToken) || hasAdminAccount()) {
        throw new Error("Código de criação de administrador inválido ou já utilizado.");
      }
      isAdmin = true;
    }

    const user = createAccount(email, input.nickname.trim(), passwordHash, isAdmin);
    db.prepare(`
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), user.id, authTokenHash, expiresAt);
    return { user, token };
  });

  return create.immediate();
}

export async function authenticate(identifier: string, password: string, clientKey = identifier) {
  const now = Date.now();
  const failureKey = `${clientKey}:${identifier.trim().toLowerCase()}`;
  for (const [key, entry] of loginFailures) {
    if (entry.resetAt <= now) loginFailures.delete(key);
  }
  const failures = loginFailures.get(failureKey);
  if (failures && failures.count >= MAX_LOGIN_FAILURES && failures.resetAt > now) return undefined;

  const user = getUserForLogin(identifier.trim());
  if (!user) {
    await derivePassword(password, Buffer.alloc(16));
    recordLoginFailure(failureKey, now);
    return undefined;
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    recordLoginFailure(failureKey, now);
    return undefined;
  }
  loginFailures.delete(failureKey);
  return {
    user: { id: user.id, nickname: user.nickname, email: user.email, is_admin: user.is_admin === 1 },
    token: createAuthSession(user.id),
  };
}

function recordLoginFailure(key: string, now: number): void {
  const current = loginFailures.get(key);
  if (!current || current.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_FAILURE_WINDOW_MS });
    return;
  }
  current.count += 1;
}

export function resumeAuthentication(token: string) {
  const row = db.prepare(`
    SELECT u.id, u.nickname, u.email, u.is_admin
    FROM auth_sessions a
    JOIN users u ON u.id = a.user_id
    WHERE a.token_hash = ? AND a.expires_at > unixepoch()
      AND u.password_hash IS NOT NULL
  `).get(hashAuthToken(token)) as
    | { id: string; nickname: string; email: string; is_admin: number }
    | undefined;

  if (!row) return undefined;
  return {
    user: { id: row.id, nickname: row.nickname, email: row.email, is_admin: row.is_admin === 1 },
    token,
  };
}

export function revokeAuthSession(token: string): void {
  db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashAuthToken(token));
}

export function isAuthSessionActive(userId: string, token: string): boolean {
  return db.prepare(`
    SELECT 1 FROM auth_sessions
    WHERE user_id = ? AND token_hash = ? AND expires_at > unixepoch()
  `).get(userId, hashAuthToken(token)) !== undefined;
}

export function updateAccountCredentials(userId: string, email: string, passwordHash: string): boolean {
  const update = db.transaction(() => {
    const target = getUserByIdForAdmin(userId);
    if (!target) return false;
    const normalizedEmail = normalizeEmail(email);
    if (!accountCredentialsAvailable(normalizedEmail, target.nickname, userId)) {
      throw new Error("O e-mail ou apelido já está vinculado a outra conta.");
    }
    const updated = setUserCredentials(userId, normalizedEmail, passwordHash);
    if (!updated) return false;
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
    return true;
  });
  return update.immediate();
}
