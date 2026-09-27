import type { WebSocket } from "ws";
import type { Role } from "./db/index.js";

export type ClientState = {
  ws: WebSocket;
  user_id: string | null;
  nickname: string;
  session_id: string | null;
  role: Role;
  scene_id: string | null;
};

class ClientRegistry {
  private all = new Set<ClientState>();
  private bySession = new Map<string, Set<ClientState>>();
  private byScene = new Map<string, Set<ClientState>>();

  add(state: ClientState) {
    this.all.add(state);
  }

  remove(state: ClientState) {
    this.all.delete(state);
    this.removeFromSession(state);
    this.removeFromScene(state);
  }

  // Troca a sessão do client, atualizando o índice. Passe null para sair de qualquer sessão.
  setSession(state: ClientState, session_id: string | null) {
    this.removeFromSession(state);
    state.session_id = session_id;
    if (session_id) {
      this.getOrCreate(this.bySession, session_id).add(state);
    }
  }

  // Troca a cena do client, atualizando o índice. Passe null para sair de qualquer cena.
  setScene(state: ClientState, scene_id: string | null) {
    this.removeFromScene(state);
    state.scene_id = scene_id;
    if (scene_id) {
      this.getOrCreate(this.byScene, scene_id).add(state);
    }
  }

  // Retorna cópias para quem for iterar poder fazer setSession/setScene com segurança durante o loop.
  inSession(session_id: string): ClientState[] {
    return [...(this.bySession.get(session_id) ?? [])];
  }

  inScene(scene_id: string): ClientState[] {
    return [...(this.byScene.get(scene_id) ?? [])];
  }

  private removeFromSession(state: ClientState) {
    if (state.session_id) {
      this.bySession.get(state.session_id)?.delete(state);
    }
  }

  private removeFromScene(state: ClientState) {
    if (state.scene_id) {
      this.byScene.get(state.scene_id)?.delete(state);
    }
  }

  private getOrCreate(map: Map<string, Set<ClientState>>, key: string) {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    return set;
  }
}

export const clientRegistry = new ClientRegistry();