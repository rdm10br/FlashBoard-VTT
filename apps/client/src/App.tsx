import { useEffect, useState } from "react";
import { Login } from "./lobby/Login";
import { Lobby } from "./lobby/Lobby";
import { SessionInfo } from "./lobby/SessionInfo";
import { SocketManager } from "./network/socket";
import type { ChatMessage, InviteCodeSummary, Role, ServerMessage  } from "@vtt/protocol";
import type { ConnectionStatus } from "./network/socket";

type Screen = "login" | "lobby" | "game";

type UserData = {
  user_id: string;
  nickname: string;
  sessions: { id: string; name: string; owner_id: string; role: Role }[];
};

type SessionData = {
  session_id: string;
  session_name: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodeSummary[];
  chat?: ChatMessage[];
};

import {
  getSavedNickname,
  saveNickname,
  clearNickname,
  getSavedBootId,
  saveBootId,
  clearBootId,
} from "./network/authStorage";

type AppProps = {
  socket: SocketManager;
  onSessionJoined: (session_id: string, role: Role) => void;
};

export function App({ socket, onSessionJoined }: AppProps) {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<UserData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");

  const joinCodeFromUrl = new URLSearchParams(window.location.search).get("join");

  function handleLogout() {
    clearNickname();
    clearBootId();
    setUser(null);
    setUserError(null);
    setSessionError(null);
    setScreen("login");
  }

  useEffect(() => {
    let currentBootId: string | null = null;

    socket.connect(
      (data: ServerMessage) => {
      if (data.type === "CONNECTED") {
      currentBootId = data.payload.boot_id;
      const savedBootId = getSavedBootId();
      const saved = getSavedNickname();

      if (saved && savedBootId === currentBootId) {
        // Mesmo servidor de antes (boot_id bate) — relogin automático.
        socket.send({ type: "USER_LOGIN", payload: { nickname: saved } });
      } else {
        // Servidor reiniciou desde o último login salvo (ou nunca logamos aqui) — força login manual.
        clearNickname();
        clearBootId();
      }
      return;
    }

      if (data.type === "USER_STATE") {
      const { user_id, nickname, sessions } = data.payload;
      saveNickname(nickname);
      if (currentBootId) saveBootId(currentBootId);
      setUser({ user_id, nickname, sessions });

      // Se veio via link de convite, entra direto
      if (joinCodeFromUrl) {
        socket.send({ type: "SESSION_JOIN", payload: { code: joinCodeFromUrl } });
        return;
      }

      setScreen("lobby");
      return;
    }

      if (data.type === "USER_ERROR") {
        setUserError(data.payload.message);
        return;
      }

      if (data.type === "SESSION_JOINED") {
        const { session_id, session_name, member, invite_codes, scenes, active_scene_id, chat } = data.payload;

        setSession({
          session_id,
          session_name,
          nickname: member.nickname || user?.nickname || "",
          role: member.role,
          invite_codes,
          chat,
        });

        setScreen("game");
        onSessionJoined(session_id, member.role);

        if (scenes.length === 0 && member.role === "gm") {
          socket.send({ type: "SCENE_CREATE", payload: { name: "Cena 1" } });
        } else {
          const targetId = active_scene_id || scenes[0]?.id;
          if (targetId) {
            socket.send({ type: "SCENE_SWITCH", payload: { scene_id: targetId } });
          }
        }
        return;
      }

      if (data.type === "SESSION_ERROR") {
        setSessionError(data.payload.message);
        return;
      }

      if (data.type === "INVITE_CREATED") {
        setSession((prev) => {
          if (!prev) return prev;
          return { ...prev, invite_codes: [...prev.invite_codes, data.payload] };
        });
        return;
      }

      if (data.type === "INVITE_DELETED") {
        setSession((prev) => {
          if (!prev) return prev;
          return { ...prev, invite_codes: prev.invite_codes.filter((c) => c.code !== data.payload.code) };
        });
        return;
      }

      if (data.type === "CHAT_RECEIVE") {
        setSession((prev) => {
          if (!prev) return prev;
          const msgs = prev.chat ? [...prev.chat, data.payload] : [data.payload];
          return { ...prev, chat: msgs };
        });
        return;
      }

      socket.forwardToGame(data);
    },
    (status) => setConnStatus(status),
    );
  }, []);


  const showReconnectBanner = connStatus === "reconnecting" || connStatus === "closed";

  const reconnectBanner = showReconnectBanner ? (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: connStatus === "closed" ? "rgba(127,0,0,0.92)" : "rgba(30,30,30,0.92)",
      color: "#f9fafb",
      padding: "10px 20px",
      display: "flex", alignItems: "center", gap: "12px",
      fontFamily: "system-ui, sans-serif", fontSize: "14px",
      backdropFilter: "blur(4px)",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
    }}>
      <span style={{ fontSize: "18px" }}>{connStatus === "closed" ? "✖" : "⟳"}</span>
      {connStatus === "reconnecting"
        ? "Conexão perdida — reconectando automaticamente…"
        : "Sem conexão com o servidor."}
    </div>
  ) : null;

  if (screen === "login") {
    return (
      <>
        {reconnectBanner}
        <Login
          error={userError}
          onLogin={(nickname) => {
            setUserError(null);
            socket.send({ type: "USER_LOGIN", payload: { nickname } });
          }}
        />
      </>
    );
  }

  if (screen === "lobby" && user) {
    return (
      <>
        {reconnectBanner}
        <Lobby
          nickname={user.nickname}
          sessions={user.sessions}
          serverError={sessionError}
          onSessionCreate={(name) => {
            setSessionError(null);
            socket.send({ type: "SESSION_CREATE", payload: { name } });
          }}
          onSessionJoin={(code) => {
            setSessionError(null);
            socket.send({ type: "SESSION_JOIN", payload: { code } });
          }}
          onSessionEnter={(session_id) => {
            setSessionError(null);
            socket.send({ type: "SESSION_ENTER", payload: { session_id } });
          }}
          onLogout={handleLogout}
        />
      </>
    );
  }

  if (screen === "game" && session) {
    return (
      <>
        {reconnectBanner}
        <SessionInfo
          session_id={session.session_id}
          sessionName={session.session_name}
          nickname={session.nickname}
          role={session.role}
          invite_codes={session.invite_codes}
          socket={socket}
          chat={session.chat}
        />
      </>
    );
  }

  return null;
}