import { useState, useEffect, useRef } from "react";
import type {
  ChatMessage,
  InviteCodeSummary,
  Member,
  Role,
  Scene,
  ScenePartyMember,
  SceneConfig,
  SceneMap,
  SceneMeasurementConfig,
  SessionAsset,
} from "@vtt/protocol";
import { SocketManager } from "../network/socket";
import { InvitePanel } from "./panels/InvitePanel";
import { TokenPanel } from "./panels/TokenPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { MapPanel } from "./panels/MapPanel";
import { FloatingPanel } from "./panels/FloatingPanel";
import { AssetLibraryPanel } from "./panels/AssetLibraryPanel";
import { MapToolsPanel } from "./panels/MapToolsPanel";
import { ScenePanel } from "./panels/ScenePanel";
import { SheetPanel } from "./panels/SheetPanel";
import { DiceRollerPanel } from "./panels/DiceRollerPanel";

type SessionInfoProps = {
  session_id: string;
  sessionName: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodeSummary[];
  scenes: Scene[];
  party: ScenePartyMember[];
  party_scene_id: string | null;
  assets: SessionAsset[];
  assetError: string | null;
  default_token_asset_id: string | null;
  current_scene_id: string | null;
  map: SceneMap | null;
  sceneConfig: SceneConfig | null;
  measurementConfig: SceneMeasurementConfig | null;
  socket: SocketManager;
  chat?: ChatMessage[];
  presence: (Member & { online: boolean })[];
};

export function SessionInfo({
  session_id,
  sessionName,
  nickname,
  role,
  invite_codes,
  scenes,
  party,
  party_scene_id,
  assets,
  assetError,
  current_scene_id,
  map,
  sceneConfig,
  measurementConfig,
  socket,
  chat,
  presence,
}: SessionInfoProps) {
  const [activeTab, setActiveTab] = useState<
    "session" | "scenes" | "tokens" | "chat" | "map" | "tools"
  >(() =>
    role === "gm" ? "session" : role === "viewer" ? "scenes" : "tokens",
  );
  const [detachedTab, setDetachedTab] = useState<
    null | "session" | "tokens" | "chat" | "map"
  >(null);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState<number>(380);
  const [members, setMembers] = useState<(Member & { online: boolean })[]>([]);
  const [diceOpen, setDiceOpen] = useState(false);

  useEffect(() => {
    if (role !== "gm") return;
    const refresh = () =>
      socket.send({ type: "SESSION_MEMBERS_REQUEST", payload: { session_id } });
    const onMembers = (event: Event) =>
      setMembers(
        (event as CustomEvent<(Member & { online: boolean })[]>).detail,
      );
    window.addEventListener("vtt-session-members", onMembers);
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => {
      window.removeEventListener("vtt-session-members", onMembers);
      window.clearInterval(timer);
    };
  }, [role, session_id, socket]);

  // useRef para o estado de resize: persiste entre renders sem recriar referências.
  const resizing = useRef({ active: false, startX: 0, startWidth: 380 });

  useEffect(() => {
    const inset = collapsed ? 48 : width;
    document.documentElement.style.setProperty(
      "--vtt-sidebar-inset",
      `${inset}px`,
    );
    window.dispatchEvent(
      new CustomEvent("vtt-sidebar-width", { detail: { width: inset } }),
    );
  }, [collapsed, width]);

  useEffect(
    () => () => {
      document.documentElement.style.setProperty("--vtt-sidebar-inset", "0px");
      window.dispatchEvent(
        new CustomEvent("vtt-sidebar-width", { detail: { width: 0 } }),
      );
    },
    [],
  );

  // Referências estáveis dos handlers para que removeEventListener funcione corretamente.
  const handleDoResize = useRef((e: MouseEvent) => {
    if (!resizing.current.active) return;
    const dx = resizing.current.startX - e.clientX; // sidebar fica na direita
    let newW = resizing.current.startWidth + dx;
    if (newW < 160) newW = 160;
    if (newW > 700) newW = 700;
    setWidth(newW);
  });

  const handleStopResize = useRef(() => {
    resizing.current.active = false;
    document.removeEventListener("mousemove", handleDoResize.current);
    document.removeEventListener("mouseup", handleStopResize.current);
  });

  // Ajusta aba ativa se a role mudar (ex: jogador entra como player)
  useEffect(() => {
    if (role === "gm") setActiveTab("session");
    else setActiveTab(role === "viewer" ? "scenes" : "tokens");
  }, [role]);

  // Cleanup de segurança: remove listeners se o componente desmontar durante um resize.
  useEffect(() => {
    const move = handleDoResize.current;
    const up = handleStopResize.current;
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, []);

  function roleLabel(r: Role) {
    return r === "gm" ? "GM" : r === "player" ? "Player" : "Viewer";
  }

  function startResize(e: React.MouseEvent) {
    resizing.current.active = true;
    resizing.current.startX = e.clientX;
    resizing.current.startWidth = width;
    document.addEventListener("mousemove", handleDoResize.current);
    document.addEventListener("mouseup", handleStopResize.current);
  }

  function toggleDetach(
    tab: "session" | "tokens" | "chat" | "map",
    fallback: "session" | "tokens" | "chat" | "map",
  ) {
    const next = detachedTab === tab ? null : tab;
    setDetachedTab(next);
    if (next === tab) setActiveTab(fallback);
  }

  // Cada painel é criado uma única vez — só muda de lugar (docked ou floating) conforme detachedTab.
  const sessionPanelElement =
    role === "gm" ? (
      <>
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            color: "#d1d5db",
            fontSize: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong style={{ color: "#f3f4f6" }}>
              Participantes ({members.length})
            </strong>
            <button
              style={styles.collapseBtn}
              onClick={() =>
                socket.send({
                  type: "SESSION_MEMBERS_REQUEST",
                  payload: { session_id },
                })
              }
            >
              Atualizar
            </button>
          </div>
          {members.map((member) => (
            <div
              key={member.id}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ flex: 1 }}>
                {member.nickname} · {member.online ? "online" : "offline"}
              </span>
              <select
                aria-label={`Cargo de ${member.nickname}`}
                value={member.role}
                onChange={(event) => {
                  socket.send({
                    type: "SESSION_MEMBER_ROLE_SET",
                    payload: {
                      user_id: member.id,
                      role: event.target.value as Role,
                    },
                  });
                  window.setTimeout(
                    () =>
                      socket.send({
                        type: "SESSION_MEMBERS_REQUEST",
                        payload: { session_id },
                      }),
                    500,
                  );
                }}
                style={{
                  background: "#0f172a",
                  color: "#f3f4f6",
                  border: "1px solid #343744",
                  borderRadius: 4,
                }}
              >
                <option value="gm">GM</option>
                <option value="player">Player</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                style={styles.leaveBtn}
                onClick={() => {
                  if (window.confirm(`Remover ${member.nickname} da sessão?`))
                    socket.send({
                      type: "SESSION_MEMBER_REMOVE",
                      payload: { user_id: member.id },
                    });
                }}
              >
                Remover
              </button>
            </div>
          ))}
        </section>
        <InvitePanel
          session_id={session_id}
          invite_codes={invite_codes}
          socket={socket}
        />
        <AssetLibraryPanel assets={assets} error={assetError} socket={socket} />
      </>
    ) : null;
  const tokenPanelElement = <TokenPanel role={role} />;
  const sheetPanelElement = (
    <>
      <SheetPanel sessionId={session_id} role={role} socket={socket} />
      {tokenPanelElement}
    </>
  );
  const mapPanelElement =
    role === "gm" ? (
      <MapPanel
        session_id={session_id}
        scene_id={current_scene_id}
        map={map}
        sceneConfig={sceneConfig}
        measurementConfig={measurementConfig}
        socket={socket}
      />
    ) : null;
  const mapToolsPanelElement = (
    <MapToolsPanel sceneId={current_scene_id} config={measurementConfig} />
  );
  const scenePanelElement = (
    <ScenePanel
      sessionId={session_id}
      role={role}
      scenes={scenes}
      party={party}
      partySceneId={party_scene_id}
      currentSceneId={current_scene_id}
      socket={socket}
      onConfigure={() => setActiveTab("map")}
    />
  );
  const chatPanelElement = (
    <ChatPanel
      chat={chat}
      presence={presence}
      socket={socket}
      initialHeight={detachedTab === "chat" ? 300 : 200}
      currentNickname={nickname}
      currentRole={role}
    />
  );

  return (
    <>
      <div
        style={{ ...styles.panel, width: collapsed ? "48px" : `${width}px` }}
      >
        <div style={styles.resizer} onMouseDown={startResize} />
        <div style={styles.header}>
          <div
            style={{
              display: collapsed ? "none" : "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={styles.sessionName}>{sessionName}</span>
            <span
              style={{
                ...styles.badge,
                ...(role === "gm" ? styles.badgeGm : styles.badgePlayer),
              }}
            >
              {roleLabel(role)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              style={styles.leaveBtn}
              title="Sair da sessão e voltar ao lobby"
              onClick={() =>
                socket.send({ type: "SESSION_LEAVE", payload: {} })
              }
            >
              {collapsed ? "×" : "Sair da sessão"}
            </button>
            <button
              style={styles.collapseBtn}
              onClick={() => setCollapsed((s) => !s)}
            >
              {collapsed ? "›" : "‹"}
            </button>
          </div>
        </div>
        <span
          style={{
            ...styles.nickname,
            display: collapsed ? "none" : undefined,
          }}
        >
          {nickname}
        </span>

        <div
          style={{
            ...styles.tabBar,
            flexDirection: collapsed ? "column" : "row",
          }}
        >
          {role === "gm" && (
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <button
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === "session" ? styles.tabActive : {}),
                  ...(collapsed ? styles.tabCollapsed : {}),
                }}
                onClick={() => setActiveTab("session")}
              >
                🗂 Sessão
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDetach("session", "chat");
                  }}
                  style={{
                    marginLeft: 8,
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  title="Destacar"
                >
                  ⤢
                </span>
              </button>
            </div>
          )}
          {(role === "gm" || role === "viewer") && (
            <button
              style={{
                ...styles.tabBtn,
                ...(activeTab === "scenes" ? styles.tabActive : {}),
                ...(collapsed ? styles.tabCollapsed : {}),
              }}
              onClick={() => setActiveTab("scenes")}
            >
              🎬 Cenas
            </button>
          )}
          <button
            style={{
              ...styles.tabBtn,
              ...(activeTab === "tools" ? styles.tabActive : {}),
              ...(collapsed ? styles.tabCollapsed : {}),
            }}
            onClick={() => setActiveTab("tools")}
          >
            ✏ Ferramentas
          </button>
          {role === "gm" && (
            <button
              style={{
                ...styles.tabBtn,
                ...(activeTab === "map" ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab("map")}
            >
              🗺 Mapa da cena
            </button>
          )}
          {role !== "viewer" && (
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <button
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === "tokens" ? styles.tabActive : {}),
                  ...(collapsed ? styles.tabCollapsed : {}),
                }}
                onClick={() => setActiveTab("tokens")}
              >
                📄 Fichas
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDetach("tokens", role === "gm" ? "session" : "chat");
                  }}
                  style={{
                    marginLeft: 8,
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  title="Destacar"
                >
                  ⤢
                </span>
              </button>
            </div>
          )}
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <button
              style={{
                ...styles.tabBtn,
                ...(activeTab === "chat" ? styles.tabActive : {}),
                ...(collapsed ? styles.tabCollapsed : {}),
              }}
              onClick={() => setActiveTab("chat")}
            >
              💬 Chat
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDetach("chat", role === "gm" ? "session" : "tokens");
                }}
                style={{
                  marginLeft: 8,
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="Destacar"
              >
                ⤢
              </span>
            </button>
          </div>
        </div>

        {activeTab === "session" &&
          detachedTab !== "session" &&
          sessionPanelElement}
        {activeTab === "scenes" && scenePanelElement}
        {activeTab === "map" && detachedTab !== "map" && mapPanelElement}
        {activeTab === "tools" && mapToolsPanelElement}
        {activeTab === "tokens" &&
          detachedTab !== "tokens" &&
          sheetPanelElement}
        {activeTab === "chat" && detachedTab !== "chat" && chatPanelElement}
      </div>
      {role !== "viewer" && (
        <button
          style={styles.diceFab}
          onClick={() => setDiceOpen((open) => !open)}
        >
          🎲 Dados
        </button>
      )}
      {diceOpen && role !== "viewer" && (
        <FloatingPanel
          title="Rolar dados"
          initialPos={{ x: 60, y: 120 }}
          onClose={() => setDiceOpen(false)}
        >
          <DiceRollerPanel sessionId={session_id} socket={socket} />
        </FloatingPanel>
      )}
      {detachedTab && (
        <FloatingPanel onClose={() => setDetachedTab(null)} title={detachedTab}>
          {detachedTab === "session" && sessionPanelElement}
          {detachedTab === "map" && mapPanelElement}
          {detachedTab === "tokens" && sheetPanelElement}
          {detachedTab === "chat" && chatPanelElement}
        </FloatingPanel>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    zIndex: 100,
    background: "#1f2028",
    borderLeft: "1px solid #2e303a",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontFamily: "system-ui, sans-serif",
    width: "380px",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionName: {
    color: "#f3f4f6",
    fontWeight: 600,
    fontSize: "15px",
  },
  badge: {
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "12px",
    fontWeight: 600,
  },
  badgeGm: {
    background: "rgba(170,59,255,0.15)",
    border: "1px solid rgba(170,59,255,0.4)",
    color: "#c084fc",
  },
  badgePlayer: {
    background: "rgba(59,130,246,0.15)",
    border: "1px solid rgba(59,130,246,0.4)",
    color: "#93c5fd",
  },
  nickname: {
    color: "#9ca3af",
    fontSize: "13px",
  },
  tabBar: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  tabBtn: {
    background: "transparent",
    border: "1px solid transparent",
    color: "#9ca3af",
    padding: "8px 12px",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
  },
  tabActive: {
    background: "#0b1220",
    color: "#f3f4f6",
    border: "1px solid #3b82f6",
    boxShadow: "inset 0 -1px 0 0 #0b1220",
  },
  tabCollapsed: {
    padding: "6px 8px",
    borderRadius: "4px",
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
  },
  resizer: {
    position: "absolute",
    left: "-6px",
    top: 0,
    bottom: 0,
    width: "12px",
    cursor: "col-resize",
    zIndex: 200,
  },
  collapseBtn: {
    background: "transparent",
    border: "1px solid #2e303a",
    color: "#9ca3af",
    borderRadius: "6px",
    padding: "4px 6px",
    cursor: "pointer",
  },
  leaveBtn: {
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.45)",
    color: "#fca5a5",
    borderRadius: "6px",
    padding: "4px 7px",
    cursor: "pointer",
    fontSize: "11px",
  },
  diceFab: {
    position: "fixed",
    left: 16,
    bottom: 16,
    zIndex: 100,
    padding: "10px 14px",
    background: "#aa3bff",
    border: "none",
    borderRadius: 999,
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
};