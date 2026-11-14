import { useCallback, useEffect, useRef, useState } from "react";
import { Login } from "./lobby/Login";
import { Lobby } from "./lobby/Lobby";
import { SessionInfo } from "./lobby/SessionInfo";
import { SocketManager } from "./network/socket";
import type {
  ChatMessage,
  InviteCodeSummary,
  Role,
  Scene,
  ScenePartyMember,
  SceneConfig,
  SceneMeasurementConfig,
  ServerMessage,
  SessionAsset,
  Member,
} from "@vtt/protocol";
import type { ConnectionStatus } from "./network/socket";
import { setAssetKey } from "./network/apiBase";

type Screen = "login" | "lobby" | "game";

type UserData = {
  user_id: string;
  nickname: string;
  is_admin: boolean;
  sessions: { id: string; name: string; owner_id: string; role: Role }[];
};

type SessionData = {
  session_id: string;
  session_name: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodeSummary[];
  default_token_asset_id: string | null;
  chat?: ChatMessage[];
  scenes: Scene[];
  party: ScenePartyMember[];
  party_scene_id: string | null;
  presence: (Member & { online: boolean })[];
};

import {
  clearAuthToken,
  getSavedAuthToken,
  saveAuthToken,
} from "./network/authStorage";
import type { AdminUserSummary } from "@vtt/protocol";
import type { SceneMap } from "@vtt/protocol";

type AppProps = {
  socket: SocketManager;
  onSessionJoined: (session_id: string, role: Role) => void;
};

export function App({ socket, onSessionJoined }: AppProps) {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<UserData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [sceneMap, setSceneMap] = useState<SceneMap | null>(null);
  const [measurementConfig, setMeasurementConfig] =
    useState<SceneMeasurementConfig | null>(null);
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([]);
  const [sessionAssets, setSessionAssets] = useState<SessionAsset[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [adminBootstrapAvailable, setAdminBootstrapAvailable] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const showToast = useCallback(
    (message: string) => setToast({ id: Date.now(), message }),
    [],
  );
  const sessionRef = useRef<SessionData | null>(null);
  const refreshAdminUsers = useCallback(() => {
    socket.send({ type: "ADMIN_LIST_USERS", payload: {} });
  }, [socket]);

  const pendingJoinCode = useRef(
    new URLSearchParams(window.location.search).get("join"),
  );

  function handleLogout() {
    socket.send({ type: "USER_LOGOUT", payload: {} });
    clearAuthToken();
    sessionRef.current = null;
    setCurrentSceneId(null);
    setSceneMap(null);
    setMeasurementConfig(null);
    setSceneConfig(null);
    setUser(null);
    setSession(null);
    setUserError(null);
    setSessionError(null);
    setAdminError(null);
    setSessionAssets([]);
    setAssetError(null);
    setScreen("login");
    setAssetKey(null);
  }

  useEffect(() => {
    let resumeAttempt = false;

    socket.connect(
      (data: ServerMessage) => {
        if (data.type === "CONNECTED") {
          setAdminBootstrapAvailable(data.payload.admin_bootstrap_available);
          const savedToken = getSavedAuthToken();
          if (savedToken) {
            resumeAttempt = true;
            socket.send({
              type: "USER_RESUME",
              payload: { token: savedToken },
            });
          } else {
            setScreen("login");
          }
          return;
        }

        if (data.type === "USER_STATE") {
          resumeAttempt = false;
          const { user_id, nickname, sessions } = data.payload;
          saveAuthToken(data.payload.auth_token);
          setUser({
            user_id,
            nickname,
            sessions,
            is_admin: data.payload.is_admin,
          });
          if (data.payload.is_admin)
            socket.send({ type: "ADMIN_LIST_USERS", payload: {} });

          // Se veio via link de convite, entra direto
          // if (joinCodeFromUrl) {
          //   socket.send({ type: "SESSION_JOIN", payload: { code: joinCodeFromUrl } });
          //   return;
          // }
          const joinCode = pendingJoinCode.current;
          if (joinCode) {
            pendingJoinCode.current = null;
            window.history.replaceState({}, "", window.location.pathname);
            socket.send({ type: "SESSION_JOIN", payload: { code: joinCode } });
            return;
          }

          const previousSession = sessionRef.current;
          if (previousSession) {
            socket.send({
              type: "SESSION_ENTER",
              payload: { session_id: previousSession.session_id },
            });
          } else {
            setScreen("lobby");
          }
          return;
        }

        if (data.type === "USER_ERROR") {
          if (resumeAttempt) {
            resumeAttempt = false;
            clearAuthToken();
            sessionRef.current = null;
            setSession(null);
            setUser(null);
            setScreen("login");
          }
          if (sessionRef.current) showToast(data.payload.message);
          setAdminError(data.payload.message);
          setUserError(data.payload.message);
          return;
        }

        if (data.type === "USER_LOGGED_OUT") {
          clearAuthToken();
          sessionRef.current = null;
          setAdminUsers([]);
          setSessionAssets([]);
          setAssetError(null);
          setSession(null);
          setUser(null);
          setMeasurementConfig(null);
          setSceneConfig(null);
          setUserError(null);
          setAdminError(null);
          setScreen("login");
          setAssetKey(null);
          return;
        }

        if (data.type === "ADMIN_USERS") {
          setAdminUsers(data.payload.users);
          setAdminError(null);
          return;
        }

        if (data.type === "SESSION_JOINED") {
          // const { session_id, session_name, member, invite_codes, scenes, active_scene_id, default_token_asset_id, chat } = data.payload;
          const {
            session_id,
            session_name,
            member,
            invite_codes,
            scenes,
            active_scene_id,
            default_token_asset_id,
            chat,
            asset_key,
          } = data.payload;
          setAssetKey(asset_key);
          setCurrentSceneId(active_scene_id || scenes[0]?.id || null);
          setSceneMap(null);
          setMeasurementConfig(null);

          const nextSession = {
            session_id,
            session_name,
            nickname: member.nickname || user?.nickname || "",
            role: member.role,
            invite_codes,
            default_token_asset_id,
            chat,
            scenes,
            party: [],
            party_scene_id: null,
            presence: [],
          };
          sessionRef.current = nextSession;
          setSession(nextSession);
          socket.forwardToGame(data);
          setSessionAssets([]);
          setAssetError(null);

          setScreen("game");
          onSessionJoined(session_id, member.role);

          if (member.role === "gm") {
            socket.send({
              type: "ASSET_LIST_REQUEST",
              payload: { session_id },
            });
          }

          if (scenes.length === 0 && member.role === "gm") {
            socket.send({ type: "SCENE_CREATE", payload: { name: "Cena 1" } });
          } else {
            const targetId = active_scene_id || scenes[0]?.id;
            if (targetId) {
              socket.send({
                type: "SCENE_SWITCH",
                payload: { scene_id: targetId },
              });
            }
          }
          return;
        }

        if (data.type === "SESSION_LEFT") {
          if (data.payload.session_id) {
            setUser((current) =>
              current
                ? {
                    ...current,
                    sessions: data.payload.removed
                      ? current.sessions.filter(
                          (item) => item.id !== data.payload.session_id,
                        )
                      : current.sessions.map((item) =>
                          item.id === data.payload.session_id &&
                          data.payload.role
                            ? { ...item, role: data.payload.role }
                            : item,
                        ),
                  }
                : current,
            );
          }
          socket.forwardToGame({ type: "SCENE_CLEARED", payload: {} });
          sessionRef.current = null;
          setSession(null);
          setCurrentSceneId(null);
          setSceneMap(null);
          setMeasurementConfig(null);
          setSceneConfig(null);
          setSessionAssets([]);
          setAssetError(null);
          setSessionError(null);
          setAssetKey(null);
          setScreen("lobby");
          return;
        }

        if (data.type === "SESSION_ERROR") {
          if (sessionRef.current) showToast(data.payload.message);
          else setSessionError(data.payload.message);
          return;
        }

        if (data.type === "SESSION_MEMBERS") {
          if (sessionRef.current?.session_id === data.payload.session_id) {
            window.dispatchEvent(
              new CustomEvent("vtt-session-members", {
                detail: data.payload.members,
              }),
            );
          }
          return;
        }

        if (data.type === "SESSION_PRESENCE") {
          setSession((current) =>
            current && current.session_id === data.payload.session_id
              ? { ...current, presence: data.payload.members }
              : current,
          );
          if (sessionRef.current?.session_id === data.payload.session_id) {
            window.dispatchEvent(
              new CustomEvent("vtt-session-members", {
                detail: data.payload.members,
              }),
            );
          }
          return;
        }

        if (data.type === "SCENE_STATE") {
          setCurrentSceneId(data.payload.scene_id);
          setSceneMap(data.payload.map);
          setMeasurementConfig(data.payload.measurement_config);
          setSceneConfig(data.payload.config);
          socket.forwardToGame(data);
          return;
        }

        if (data.type === "SCENE_LIST") {
          setSession((current) =>
            current && current.session_id === data.payload.session_id
              ? {
                  ...current,
                  scenes: data.payload.scenes,
                  party: data.payload.party,
                  party_scene_id: data.payload.party_scene_id,
                }
              : current,
          );
          setSessionError(null);
          return;
        }

        if (data.type === "SCENE_PARTY_STATE") {
          setSession((current) =>
            current && current.session_id === data.payload.session_id
              ? {
                  ...current,
                  party: data.payload.party,
                  party_scene_id: data.payload.party_scene_id,
                }
              : current,
          );
          return;
        }

        if (data.type === "SHEETS_LIST") {
          window.dispatchEvent(
            new CustomEvent("vtt-sheets-list", { detail: data.payload }),
          );
          return;
        }
        if (data.type === "SHEET_TEMPLATE_CHANGED") {
          window.dispatchEvent(
            new CustomEvent("vtt-sheet-template", { detail: data.payload }),
          );
          return;
        }
        if (data.type === "SHEET_CHANGED") {
          window.dispatchEvent(
            new CustomEvent("vtt-sheet-changed", { detail: data.payload }),
          );
          return;
        }

        if (data.type === "SCENE_CLEARED") {
          setCurrentSceneId(null);
          setSceneMap(null);
          setSceneConfig(null);
          setMeasurementConfig(null);
          socket.forwardToGame(data);
          return;
        }

        if (data.type === "SCENE_MEASURE_CONFIG_CHANGED") {
          setMeasurementConfig(data.payload.config);
          socket.forwardToGame(data);
          return;
        }

        if (data.type === "SCENE_CONFIG_CHANGED") {
          setSceneConfig(data.payload.config);
          socket.forwardToGame(data);
          return;
        }

        if (data.type === "SCENE_MAP_CHANGED") {
          setSceneMap(data.payload.map);
          socket.forwardToGame(data);
          return;
        }

        if (data.type === "INVITE_CREATED") {
          setSession((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              invite_codes: [...prev.invite_codes, data.payload],
            };
          });
          return;
        }

        if (data.type === "INVITE_DELETED") {
          setSession((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              invite_codes: prev.invite_codes.filter(
                (c) => c.code !== data.payload.code,
              ),
            };
          });
          return;
        }

        if (data.type === "CHAT_RECEIVE") {
          setSession((prev) => {
            if (!prev) return prev;
            const msgs = prev.chat
              ? [...prev.chat, data.payload]
              : [data.payload];
            return { ...prev, chat: msgs };
          });
          return;
        }

        if (data.type === "BACKUP_GRANT_ISSUED") {
          if (data.payload.kind === "asset_upload") {
            socket.forwardToAssetUpload(data);
          } else {
            socket.forwardToBackup(data);
          }
          return;
        }

        if (data.type === "SESSION_DEFAULT_TOKEN_ASSET_CHANGED") {
          setSession((prev) =>
            prev
              ? { ...prev, default_token_asset_id: data.payload.asset_id }
              : prev,
          );
          return;
        }

        if (data.type === "ASSET_LIST") {
          if (sessionRef.current?.session_id === data.payload.session_id) {
            setSessionAssets(data.payload.assets);
            setAssetError(null);
          }
          return;
        }

        if (data.type === "ASSET_CREATED") {
          if (sessionRef.current?.session_id === data.payload.session_id) {
            setSessionAssets((assets) =>
              assets.some((asset) => asset.id === data.payload.asset.id)
                ? assets
                : [...assets, data.payload.asset],
            );
          }
          return;
        }

        if (data.type === "ASSET_DELETED") {
          if (sessionRef.current?.session_id === data.payload.session_id) {
            setSessionAssets((assets) =>
              assets.filter((asset) => asset.id !== data.payload.asset_id),
            );
            setAssetError(null);
          }
          return;
        }

        if (data.type === "ASSET_ERROR") {
          setAssetError(data.payload.message);
          if (sessionRef.current) showToast(data.payload.message);
          return;
        }

        socket.forwardToGame(data);
      },
      (status) => setConnStatus(status),
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showReconnectBanner =
    connStatus === "reconnecting" || connStatus === "closed";

  const reconnectBanner = showReconnectBanner ? (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background:
          connStatus === "closed"
            ? "rgba(127,0,0,0.92)"
            : "rgba(30,30,30,0.92)",
        color: "#f9fafb",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        backdropFilter: "blur(4px)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <span style={{ fontSize: "18px" }}>
        {connStatus === "closed" ? "✖" : "⟳"}
      </span>
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
          bootstrapAvailable={adminBootstrapAvailable}
          onLogin={(identifier, password) => {
            setUserError(null);
            socket.send({
              type: "USER_LOGIN",
              payload: { identifier, password },
            });
          }}
          onRegister={(email, nickname, password, bootstrap_token) => {
            setUserError(null);
            socket.send({
              type: "USER_REGISTER",
              payload: { email, nickname, password, bootstrap_token },
            });
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
          isAdmin={user.is_admin ?? false}
          sessions={user.sessions}
          serverError={sessionError}
          adminError={adminError}
          adminUsers={adminUsers}
          socket={socket}
          onAdminRefresh={refreshAdminUsers}
          onAdminSetCredentials={(user_id, email, password) => {
            setAdminError(null);
            socket.send({
              type: "ADMIN_SET_USER_CREDENTIALS",
              payload: { user_id, email, password },
            });
          }}
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
          scenes={session.scenes}
          party={session.party}
          party_scene_id={session.party_scene_id}
          assets={sessionAssets}
          assetError={assetError}
          default_token_asset_id={session.default_token_asset_id}
          current_scene_id={currentSceneId}
          map={sceneMap}
          sceneConfig={sceneConfig}
          measurementConfig={measurementConfig}
          socket={socket}
          chat={session.chat}
          presence={session.presence}
        />
        {toast && (
          <div
            role="alert"
            style={{
              position: "fixed",
              top: 16,
              left: 16,
              zIndex: 9998,
              maxWidth: 420,
              background: "#ad2626",
              color: "#fee2e2",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {toast.message}
          </div>
        )}
      </>
    );
  }
  return null;
}