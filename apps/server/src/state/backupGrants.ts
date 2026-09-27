import { randomUUID } from "crypto";

type BackupGrant = {
  type: "export" | "import";
  session_id: string | null; // só preenchido em grants de export
  user_id: string;
  expires_at: number;
  used: boolean;
};

const GRANT_TTL_MS = 2 * 60 * 1000; // 2 minutos de validade
const grants = new Map<string, BackupGrant>();

function purgeExpired() {
  const now = Date.now();
  for (const [token, grant] of grants) {
    if (grant.expires_at < now) grants.delete(token);
  }
}

export function issueExportGrant(sessionId: string, userId: string) {
  purgeExpired();
  const token = randomUUID();
  const expires_at = Date.now() + GRANT_TTL_MS;
  grants.set(token, { type: "export", session_id: sessionId, user_id: userId, expires_at, used: false });
  return { token, expires_at };
}

export function issueImportGrant(userId: string) {
  purgeExpired();
  const token = randomUUID();
  const expires_at = Date.now() + GRANT_TTL_MS;
  grants.set(token, { type: "import", session_id: null, user_id: userId, expires_at, used: false });
  return { token, expires_at };
}

// Consome o grant se válido — retorna false se não existir, já tiver sido usado,
// for do tipo errado, ou (no caso de export) apontar pra outra sessão.
export function consumeGrant(token: string, type: "export" | "import", sessionId?: string): boolean {
  purgeExpired();
  const grant = grants.get(token);
  if (!grant || grant.used || grant.type !== type) return false;
  if (type === "export" && grant.session_id !== sessionId) return false;

  grant.used = true;
  grants.delete(token); // uso único — some depois de consumido, mesmo dentro da validade
  return true;
}