import { useState } from "react";
import type { ChatMessage } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";

type ChatPanelProps = {
  chat?: ChatMessage[];
  socket: SocketManager;
  maxHeight?: string;
};

export function ChatPanel({ chat, socket, maxHeight = "200px" }: ChatPanelProps) {
  const [chatInput, setChatInput] = useState("");

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.send({ type: "CHAT_SEND", payload: { text: chatInput.trim() } });
    setChatInput("");
  }

  return (
    <div style={{ marginTop: "8px" }}>
      <p style={styles.codesTitle}>Chat</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ maxHeight, overflowY: "auto", background: "#0f1115", padding: "8px", borderRadius: "6px" }}>
          {(chat ?? []).map((m) => (
            <div key={m.id} style={{ marginBottom: "6px", color: "#e5e7eb" }}>
              <strong style={{ color: "#93c5fd" }}>{m.sender}</strong>: <span>{m.text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
            placeholder="Digite mensagem"
            style={{ flex: 1, padding: "6px", borderRadius: "6px", border: "1px solid #2e303a", background: "#0f172a", color: "#f3f4f6" }}
          />
          <button onClick={sendChat} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", fontSize: "11px" }}>Enviar</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  codesTitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
};