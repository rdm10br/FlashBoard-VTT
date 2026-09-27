import { randomUUID } from "crypto";
import type { UploadAssetKind } from "@vtt/protocol";

export type GrantType = "export" | "import" | "asset_upload";

type Grant = {
  type: GrantType;
  session_id: string | null;
  user_id: string;
  asset_kind: UploadAssetKind | null;
  expires_at: number;
  used: boolean;
};

export type ConsumedGrant = Omit<Grant, "used">;

const GRANT_TTL_MS = 2 * 60 * 1000; // 2 minutos de validade
const grants = new Map<string, Grant>();

function purgeExpired() {
  const now = Date.now();
  for (const [token, grant] of grants) {
    if (grant.expires_at < now) grants.delete(token);
  }
}

export function issueGrant(
  type: GrantType,
  userId: string,
  sessionId: string | null = null,
  assetKind: UploadAssetKind | null = null,
) {
  purgeExpired();
  const token = randomUUID();
  const expires_at = Date.now() + GRANT_TTL_MS;
  grants.set(token, {
    type,
    session_id: sessionId,
    user_id: userId,
    asset_kind: assetKind,
    expires_at,
    used: false,
  });
  return { token, expires_at };
}

// Consome o grant se válido — retorna false se não existir, já tiver sido usado,
// for do tipo errado, ou (quando sessionId é passado) apontar pra outra sessão.
export function consumeGrant(
  token: string,
  type: GrantType,
  sessionId?: string,
  assetKind?: UploadAssetKind,
): ConsumedGrant | undefined {
  purgeExpired();
  const grant = grants.get(token);
  if (!grant || grant.used || grant.type !== type) return undefined;
  if (sessionId !== undefined && grant.session_id !== sessionId) return undefined;
  if (assetKind !== undefined && grant.asset_kind !== assetKind) return undefined;

  grant.used = true;
  grants.delete(token); // uso único — some mesmo dentro da validade
  const { used: _used, ...consumed } = grant;
  return consumed;
}