import { useState } from "react";
import type { Role } from "@vtt/protocol";

type Tab = "create" | "join";

type LobbyProps = {
  nickname: string;
  sessions: { id: string; name: string; owner_id: string; role: Role }[];
  serverError?: string | null;
  onSessionCreate: (name: string) => void;
  onSessionJoin: (code: string) => void;
  onSessionEnter: (session_id: string) => void;
  onLogout: () => void;
};

export function Lobby({
  nickname,
  sessions,
  serverError,
  onSessionCreate,
  onSessionJoin,
  onSessionEnter,
  onLogout
}: LobbyProps) {
  const [tab, setTab] = useState<Tab>("create");
  const [sessionName, setSessionName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!sessionName.trim()) { setError("Digite o nome da sessão."); return; }
    setError(null);
    onSessionCreate(sessionName.trim());
    setSessionName("");
  }

  function handleJoin() {
    if (!code.trim()) { setError("Digite o código de convite."); return; }
    setError(null);
    onSessionJoin(code.trim().toUpperCase());
    setCode("");
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>⚔️ VTT</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={styles.nickname}>Olá, {nickname}</span>
            <button style={styles.logoutBtn} onClick={onLogout}>Sair</button>
          </div>
        </div>

        {/* Sessões existentes */}
        {sessions.length > 0 && (
          <div style={styles.section}>
            <p style={styles.sectionTitle}>Suas sessões</p>
            <div style={styles.sessionList}>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  style={styles.sessionRow}
                  onClick={() => onSessionEnter(s.id)}
                >
                  <span style={styles.sessionName}>{s.name}</span>
                  <span style={{
                    ...styles.badge,
                    ...(s.role === "gm" ? styles.badgeGm : styles.badgePlayer)
                  }}>
                    {s.role === "gm" ? "GM" : "Player"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === "create" ? styles.tabActive : {}) }}
            onClick={() => { setTab("create"); setError(null); }}
          >
            Criar sessão
          </button>
          <button
            style={{ ...styles.tab, ...(tab === "join" ? styles.tabActive : {}) }}
            onClick={() => { setTab("join"); setError(null); }}
          >
            Entrar com código
          </button>
        </div>

        {tab === "create" && (
          <div style={styles.field}>
            <label style={styles.label}>Nome da sessão</label>
            <input
              style={styles.input}
              placeholder="Ex: Campanha do Dragão"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        )}

        {tab === "join" && (
          <div style={styles.field}>
            <label style={styles.label}>Código de convite</label>
            <input
              style={{ ...styles.input, textTransform: "uppercase", letterSpacing: "0.2em" }}
              placeholder="Ex: XKCD42"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>
        )}

        {(error || serverError) && (
          <p style={styles.error}>{error || serverError}</p>
        )}

        <button
          style={styles.btn}
          onClick={tab === "create" ? handleCreate : handleJoin}
        >
          {tab === "create" ? "Criar e entrar" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#16171d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1f2028",
    border: "1px solid #2e303a",
    borderRadius: "12px",
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    margin: 0,
    color: "#f3f4f6",
    fontSize: "24px",
    fontWeight: 600,
  },
  nickname: {
    color: "#9ca3af",
    fontSize: "14px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  sectionTitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  sessionList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  sessionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "8px",
    cursor: "pointer",
    color: "#f3f4f6",
    fontSize: "14px",
    transition: "border-color 0.15s",
  },
  sessionName: {
    color: "#f3f4f6",
    fontSize: "14px",
  },
  badge: {
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "11px",
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
  tabs: {
    display: "flex",
    gap: "8px",
  },
  tab: {
    flex: 1,
    padding: "8px",
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "14px",
  },
  tabActive: {
    background: "rgba(170, 59, 255, 0.15)",
    border: "1px solid rgba(170, 59, 255, 0.5)",
    color: "#c084fc",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    color: "#9ca3af",
    fontSize: "13px",
  },
  input: {
    padding: "10px 12px",
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#f3f4f6",
    fontSize: "15px",
    outline: "none",
  },
  error: {
    margin: 0,
    color: "#f87171",
    fontSize: "13px",
  },
  btn: {
    padding: "12px",
    background: "#aa3bff",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
  logoutBtn: {
    padding: "4px 10px",
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "12px",
  },
};