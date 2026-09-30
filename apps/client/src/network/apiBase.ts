// Em dev, o client (Vite) roda numa porta diferente do backend — reaproveitamos
// a mesma VITE_WS_URL já usada pelo socket, convertendo ws(s):// para http(s)://.
// Em produção, client e server são servidos pela mesma origem (Fastify).
function computeApiOrigin(): string {
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (wsUrl) {
    return wsUrl.replace(/^ws/, "http");
  }
  return window.location.origin;
}

export const API_ORIGIN = computeApiOrigin();

export const PUBLIC_ORIGIN = import.meta.env.VITE_PUBLIC_URL ?? window.location.origin;

export function assetUrl(assetId: string): string {
  return `${API_ORIGIN}/api/assets/${assetId}`;
}

export const ASSET_UPLOAD_URL = `${API_ORIGIN}/api/assets/upload`;