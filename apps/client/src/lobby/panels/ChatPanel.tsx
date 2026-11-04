import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ChatMessage, Member, Role } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";

type PresenceMember = Member & { online: boolean };

type ChatPanelProps = {
  chat?: ChatMessage[];
  presence?: PresenceMember[];
  socket: SocketManager;
  initialHeight?: number;
};

const BOTTOM_THRESHOLD = 24;
const MIN_HEIGHT = 80;
// Sobrevive à remontagem do painel (troca de aba / destacar).
let savedHeight: number | null = null;

function roleLabel(role: Role) {
  return role === "gm" ? "GM" : role === "player" ? "Player" : "Viewer";
}

function parseRollText(text: string, details?: ChatMessage["roll_details"]) {
  const arrowIdx = text.indexOf(" → ");
  if (arrowIdx !== -1) {
    const header = text.slice(0, arrowIdx).trim();
    const rest = text.slice(arrowIdx + 3);
    const eqIdx = rest.lastIndexOf(" = ");
    if (eqIdx !== -1) {
      const breakdown = rest.slice(0, eqIdx).trim();
      const total = rest.slice(eqIdx + 3).trim();
      return { header, breakdown, total };
    }
  }
  if (details) {
    const dicePart = `Rolou ${details.dice}${details.advantage ? " (vantagem)" : details.disadvantage ? " (desvantagem)" : ""}${details.attribute ? ` ${details.attribute}` : ""}`;
    const breakdown = details.results ? `[${details.results.join(", ")}]` : "";
    return {
      header: dicePart,
      breakdown,
      total: String(details.total),
    };
  }
  return null;
}

function RollBoxMessage({ message }: { message: ChatMessage }) {
  const [isOpen, setIsOpen] = useState(false);
  const roll = parseRollText(message.text, message.roll_details);

  if (!roll) {
    return (
      <div style={styles.messageItem}>
        <strong style={{ color: "#93c5fd" }}>{message.sender}</strong>:{" "}
        <span>{message.text}</span>
      </div>
    );
  }

  return (
    <div style={styles.messageItem}>
      <div
        onClick={() => setIsOpen((open) => !open)}
        style={{
          ...styles.rollBox,
          borderColor: isOpen ? "#6366f1" : "#2d3345",
          background: isOpen ? "#181c28" : "#13161f",
        }}
        title="Clique para alternar detalhes da rolagem"
      >
        <div style={styles.rollHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "16px" }}>🎲</span>
            <strong style={{ color: "#93c5fd" }}>{message.sender}</strong>
            <span style={{ color: "#cbd5e1" }}>{roll.header}</span>
          </div>
          <span style={styles.rollToggleBtn}>
            {isOpen ? "▲ Ocultar" : "▼ Detalhes"}
          </span>
        </div>

        {/* Quando aberta: exibe os números das rolagens e o resultado */}
        {isOpen && (
          <div style={styles.rollBreakdownRow}>
            <span style={{ color: "#9ca3af", fontSize: "14px" }}>Rolagens:</span>
            <code style={styles.rollBreakdownCode}>{roll.breakdown}</code>
          </div>
        )}

        {/* Resultado sempre visível em destaque e em negrito */}
        <div style={styles.rollResultRow}>
          <span style={{ color: "#9ca3af", fontSize: "14px" }}>Resultado:</span>
          <strong style={styles.rollTotalBold}>{roll.total}</strong>
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({
  chat,
  presence = [],
  socket,
  initialHeight = 200,
}: ChatPanelProps) {
  const [chatInput, setChatInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prevLengthRef = useRef<number | null>(null);
  const startHeight = useRef(savedHeight ?? initialHeight);
  const messages = chat ?? [];

  const onlineMembers = presence
    .filter((member) => member.online)
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const syncBottomState = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const near =
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
    stickRef.current = near;
    setAtBottom(near);
    if (near) setUnread(0);
  }, []);

  // Mensagem nova: acompanha se já estava no fim; senão só conta como não lida.
  useLayoutEffect(() => {
    const previous = prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (previous === null || messages.length < previous || stickRef.current) {
      scrollToBottom();
      setUnread(0);
      setAtBottom(true);
      return;
    }
    if (messages.length > previous)
      setUnread((n) => n + (messages.length - previous));
  }, [messages.length, scrollToBottom]);

  // Redimensionar: guarda a altura e mantém o fim visível se estava colado nele.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      savedHeight = el.offsetHeight;
      if (stickRef.current) scrollToBottom();
      syncBottomState();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollToBottom, syncBottomState]);

  function jumpToBottom() {
    stickRef.current = true;
    scrollToBottom();
    setUnread(0);
    setAtBottom(true);
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    stickRef.current = true;
    scrollToBottom();
    socket.send({ type: "CHAT_SEND", payload: { text } });
    setChatInput("");
  }

  const jumpLabel =
    unread > 0
      ? `↓ ${unread} ${unread === 1 ? "nova mensagem" : "novas mensagens"}`
      : "↓ Ir para o final";

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={styles.presence}>
        <p style={styles.codesTitle}>Online ({onlineMembers.length})</p>
        <div style={styles.presenceList}>
          {onlineMembers.map((member) => (
            <span
              key={member.id}
              style={styles.chip}
              title={roleLabel(member.role)}
            >
              <span style={styles.dot} />
              {member.nickname}
              <span style={styles.roleTag}>{roleLabel(member.role)}</span>
            </span>
          ))}
        </div>
      </div>

      <p style={{ ...styles.codesTitle, marginTop: "10px" }}>Chat</p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "4px",
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            onScroll={syncBottomState}
            style={{
              height: startHeight.current,
              minHeight: MIN_HEIGHT,
              maxHeight: "70vh",
              overflowY: "auto",
              resize: "vertical",
              background: "#0f1115",
              padding: "8px",
              borderRadius: "6px",
            }}
          >
            {messages.map((m) => {
              const isRoll =
                m.message_type === "roll" ||
                (m.text.includes(" → ") && m.text.includes(" = "));
              if (isRoll) {
                return <RollBoxMessage key={m.id} message={m} />;
              }
              return (
                <div key={m.id} style={styles.messageItem}>
                  <strong style={{ color: "#93c5fd" }}>{m.sender}</strong>:{" "}
                  <span>{m.text}</span>
                </div>
              );
            })}
          </div>
          {!atBottom && (
            <button
              onClick={jumpToBottom}
              style={{
                ...styles.jump,
                background: unread > 0 ? "#3b82f6" : "#143264",
                fontSize: "16px",
              }}
            >
              {jumpLabel}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendChat();
            }}
            placeholder="Digite mensagem ou / para Comandos"
            style={{
              flex: 1,
              padding: "6px",
              borderRadius: "6px",
              border: "1px solid #5c6074",
              background: "#0f172a",
              color: "#f3f4f6",
              fontSize: "16px",
            }}
          />
          <button
            onClick={sendChat}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  codesTitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  presence: { display: "flex", flexDirection: "column", gap: "6px" },
  presenceList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    maxHeight: "72px",
    overflowY: "auto",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "2px 8px",
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "999px",
    color: "#e5e7eb",
    fontSize: "12px",
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#22c55e",
    flexShrink: 0,
  },
  roleTag: { color: "#6b7280", fontSize: "10px" },
  messageItem: {
    marginBottom: "6px",
    color: "#e5e7eb",
    wordBreak: "break-word",
    fontSize: "18px",
  },
  rollBox: {
    margin: "4px 0",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #2d3345",
    background: "#13161f",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    userSelect: "none",
    transition: "border-color 0.15s ease, background 0.15s ease",
  },
  rollHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    fontSize: "15px",
  },
  rollToggleBtn: {
    fontSize: "12px",
    color: "#a5b4fc",
    background: "#1e1b4b",
    padding: "2px 8px",
    borderRadius: "999px",
    flexShrink: 0,
    fontWeight: 600,
  },
  rollBreakdownRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    background: "#0a0c10",
    borderRadius: "4px",
    border: "1px solid #1e2230",
  },
  rollBreakdownCode: {
    color: "#e2e8f0",
    fontSize: "15px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  rollResultRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
  },
  rollTotalBold: {
    color: "#38bdf8",
    fontSize: "20px",
    fontWeight: 800,
    textShadow: "0 0 10px rgba(56, 189, 248, 0.35)",
  },
  jump: {
    position: "absolute",
    bottom: "10px",
    left: "50%",
    transform: "translateX(-50%)",
    color: "#fff",
    border: "none",
    borderRadius: "999px",
    padding: "4px 12px",
    fontSize: "11px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
};
