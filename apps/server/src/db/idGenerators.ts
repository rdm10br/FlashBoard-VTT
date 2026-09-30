import { randomUUID, randomInt } from "crypto";

export function generateId(prefix: string): string {
  // return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return `${prefix}_${randomUUID()}`;
}

export function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // return Array.from({ length: 6 }, () =>
  //   chars[Math.floor(Math.random() * chars.length)]
  // ).join("");
  return Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join("");
}