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