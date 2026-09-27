import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { User } from "./types.js";
import type { AdminUserSummary } from "@vtt/protocol";

export type AuthUser = User & {
  email: string;
  password_hash: string;
  is_admin: number;
};

export function getUserById(id: string): User | undefined {
  return db.prepare("SELECT id, nickname FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByNickname(nickname: string): User | undefined {
  return db.prepare("SELECT id, nickname FROM users WHERE nickname = ?").get(nickname) as User | undefined;
}

export function getUserForLogin(identifier: string): AuthUser | undefined {
  return db.prepare(`
    SELECT id, nickname, email, password_hash, is_admin
    FROM users
    WHERE password_hash IS NOT NULL
      AND (email = ? COLLATE NOCASE OR nickname = ? COLLATE NOCASE)
  `).get(identifier, identifier) as AuthUser | undefined;
}

export function createAccount(email: string, nickname: string, passwordHash: string, isAdmin: boolean) {
  const id = generateId("user");
  db.prepare(`
    INSERT INTO users (id, email, nickname, password_hash, is_admin)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, nickname, passwordHash, isAdmin ? 1 : 0);
  return { id, email, nickname, is_admin: isAdmin };
}

export function hasAdminAccount(): boolean {
  return db.prepare("SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1").get() !== undefined;
}

export function accountIdentityAvailable(email: string, nickname: string): boolean {
  return db.prepare(`
    SELECT 1 FROM users
    WHERE email = ? COLLATE NOCASE
       OR nickname = ? COLLATE NOCASE
       OR nickname = ? COLLATE NOCASE
       OR email = ? COLLATE NOCASE
    LIMIT 1
  `).get(email, nickname, email, nickname) === undefined;
}

export function accountCredentialsAvailable(email: string, nickname: string, exceptUserId: string): boolean {
  return db.prepare(`
    SELECT 1 FROM users
    WHERE id != ? AND (
      email = ? COLLATE NOCASE OR
      nickname = ? COLLATE NOCASE OR
      nickname = ? COLLATE NOCASE OR
      email = ? COLLATE NOCASE
    )
    LIMIT 1
  `).get(exceptUserId, email, nickname, email, nickname) === undefined;
}

export function listAdminUsers(): AdminUserSummary[] {
  return db.prepare(`
    SELECT id, nickname, email, is_admin, password_hash
    FROM users
    ORDER BY nickname COLLATE NOCASE
  `).all().map((row: any) => ({
    id: row.id,
    nickname: row.nickname,
    email: row.email,
    is_admin: row.is_admin === 1,
    is_legacy: row.password_hash === null,
  }));
}

export function getUserByIdForAdmin(id: string): User | undefined {
  return db.prepare("SELECT id, nickname FROM users WHERE id = ?").get(id) as User | undefined;
}

export function hasUserCredentials(id: string): boolean {
  return db.prepare("SELECT 1 FROM users WHERE id = ? AND password_hash IS NOT NULL").get(id) !== undefined;
}

export function setUserCredentials(id: string, email: string, passwordHash: string): boolean {
  const result = db.prepare(
    "UPDATE users SET email = ?, password_hash = ? WHERE id = ?"
  ).run(email, passwordHash, id);
  return result.changes > 0;
}

export function createUser(nickname: string): User {
  const id = generateId("user");
  db.prepare("INSERT INTO users (id, nickname) VALUES (?, ?)").run(id, nickname);
  return { id, nickname };
}

export function getOrCreateUserByNickname(nickname: string): User {
  const existing = getUserByNickname(nickname);
  return existing ?? createUser(nickname);
}