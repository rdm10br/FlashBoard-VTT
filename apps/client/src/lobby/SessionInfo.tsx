import { useState, useEffect, useRef } from "react";
import type { ChatMessage, InviteCodeSummary, Role } from "@vtt/protocol";
import { SocketManager } from "../network/socket";
import { InvitePanel } from "./panels/InvitePanel";
import { TokenPanel } from "./panels/TokenPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { FloatingPanel } from "./panels/FloatingPanel";

type SessionInfoProps = {
  session_id: string;
  sessionName: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodeSummary[];
  socket: SocketManager;
  chat?: ChatMessage[];
};

export function SessionInfo({ session_id, sessionName, nickname, role, invite_codes, socket, chat }: SessionInfoProps) {
  const [activeTab, setActiveTab] = useState<"session" | "tokens" | "chat">(() => (role === "gm" ? "session" : "tokens"));
  const [detachedTab, setDetachedTab] = useState<null | "session" | "tokens" | "chat">(null);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState<number>(380);

  // useRef para o estado de resize: persiste entre renders sem recriar referências.
  const resizing = useRef({ active: false, startX: 0, startWidth: 380 });

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
    else setActiveTab("tokens");
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

  function toggleDetach(tab: "session" | "tokens" | "chat", fallback: "session" | "tokens" | "chat") {
    const next = detachedTab === tab ? null : tab;
    setDetachedTab(next);
    if (next === tab) setActiveTab(fallback);
  }

  // Cada painel é criado uma única vez — só muda de lugar (docked ou floating) conforme detachedTab.
  const invitePanelElement = role === "gm" ? (
    <InvitePanel session_id={session_id} invite_codes={invite_codes} socket={socket} />
  ) : null;
  const tokenPanelElement = <TokenPanel role={role} />;
  const chatPanelElement = (
    <ChatPanel chat={chat} socket={socket} maxHeight={detachedTab === "chat" ? "300px" : "200px"} />
  );

  return (
    <>
      <div style={{ ...styles.panel, width: collapsed ? "48px" : `${width}px` }}>
        <div style={styles.resizer} onMouseDown={startResize} />
        <div style={styles.header}>
          <div style={{ display: collapsed ? "none" : "flex", alignItems: "center", gap: "8px" }}>
            <span style={styles.sessionName}>{sessionName}</span>
            <span style={{ ...styles.badge, ...(role === "gm" ? styles.badgeGm : styles.badgePlayer) }}>
              {roleLabel(role)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button style={styles.collapseBtn} onClick={() => setCollapsed((s) => !s)}>{collapsed ? "›" : "‹"}</button>
          </div>
        </div>
        <span style={{ ...styles.nickname, display: collapsed ? "none" : undefined }}>{nickname}</span>

        <div style={{ ...styles.tabBar, flexDirection: collapsed ? "column" : "row" }}>
          {role === "gm" && (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", marginRight: 8 }}>
              <button
                style={{ ...styles.tabBtn, ...(activeTab === "session" ? styles.tabActive : {}), ...(collapsed ? styles.tabCollapsed : {}) }}
                onClick={() => setActiveTab("session")}
              >
                🗂 Sessão
                <span
                  onClick={(e) => { e.stopPropagation(); toggleDetach("session", "chat"); }}
                  style={{ marginLeft: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                  title="Destacar"
                >
                  ⤢
                </span>
              </button>
            </div>
          )}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", marginRight: 8 }}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === "tokens" ? styles.tabActive : {}), ...(collapsed ? styles.tabCollapsed : {}) }}
              onClick={() => setActiveTab("tokens")}
            >
              🔷 Tokens
              <span
                onClick={(e) => { e.stopPropagation(); toggleDetach("tokens", role === "gm" ? "session" : "chat"); }}
                style={{ marginLeft: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                title="Destacar"
              >
                ⤢
              </span>
            </button>
          </div>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === "chat" ? styles.tabActive : {}), ...(collapsed ? styles.tabCollapsed : {}) }}
              onClick={() => setActiveTab("chat")}
            >
              💬 Chat
              <span
                onClick={(e) => { e.stopPropagation(); toggleDetach("chat", role === "gm" ? "session" : "tokens"); }}
                style={{ marginLeft: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                title="Destacar"
              >
                ⤢
              </span>
            </button>
          </div>
        </div>

        {activeTab === "session" && detachedTab !== "session" && invitePanelElement}
        {activeTab === "tokens" && detachedTab !== "tokens" && tokenPanelElement}
        {activeTab === "chat" && detachedTab !== "chat" && chatPanelElement}
      </div>

      {detachedTab && (
        <FloatingPanel onClose={() => setDetachedTab(null)} title={detachedTab}>
          {detachedTab === "session" && invitePanelElement}
          {detachedTab === "tokens" && tokenPanelElement}
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
};