import { clientRegistry, type ClientState } from "../clientRegistry.js";
import { getMembersForSession } from "../db/index.js";
import { send } from "../ws/broadcast.js";

/** Envia a todos na sessão quem é membro e quem está conectado agora. */
export function publishPresence(sessionId: string) {
  const clients = clientRegistry.inSession(sessionId);
  const online = new Set(clients.map((c) => c.user_id).filter((id): id is string => !!id));
  const members = getMembersForSession(sessionId).map(({ id, nickname, role }) => ({
    id, nickname, role, online: online.has(id),
  }));
  for (const client of clients) {
    send(client.ws, { type: "SESSION_PRESENCE", payload: { session_id: sessionId, members } });
  }
}

/** clearAuthentication tira o cliente da sessão, então os demais precisam ser avisados. */
export function clearAuthenticationAndNotify(state: ClientState) {
  const sessionId = state.session_id;
  clientRegistry.clearAuthentication(state);
  if (sessionId) publishPresence(sessionId);
}