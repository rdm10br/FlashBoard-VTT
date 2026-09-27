import { useState } from "react";
import type { InviteCodeSummary, Role } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";

type InvitePanelProps = {
  session_id: string;
  invite_codes: InviteCodeSummary[];
  socket: SocketManager;
};

export function InvitePanel({ session_id, invite_codes, socket }: InvitePanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<Role>("player");
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  const origin = window.location.origin;

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  function createInvite() {
    const max_uses = maxUses.trim() === "" ? undefined : parseInt(maxUses, 10);
    const expires_at = expiresAt.trim() === "" ? undefined : Math.floor(new Date(expiresAt).getTime() / 1000);
    socket.send({ type: "INVITE_CREATE", payload: { session_id, role: inviteRole, max_uses, expires_at } });
    setMaxUses("");
    setExpiresAt("");
  }

  function deleteInvite(code: string) {
    socket.send({ type: "INVITE_DELETE", payload: { code } });
  }

  function formatExpiry(expires_at: number | null): string {
    if (!expires_at) return "Permanente";
    const d = new Date(expires_at * 1000);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function roleLabel(r: Role) {
    return r === "gm" ? "GM" : r === "player" ? "Player" : "Viewer";
  }

  return (
    <div style={styles.codes}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
        <p style={styles.codesTitle}>Convites <span style={styles.activeCount}>({invite_codes.length} ativos)</span></p>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "6px" }}>
        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={{ background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px", padding: "4px" }}>
          <option value="player">Player</option>
          <option value="gm">GM</option>
          <option value="viewer">Viewer</option>
        </select>
        <input
          type="number"
          min="1"
          placeholder="Usos (vazio = ∞)"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          style={{ width: "110px", padding: "4px", background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px" }}
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          style={{ padding: "4px", background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px" }}
        />
        <button style={{ ...styles.copyBtn, background: "#0f172a", color: "#f3f4f6" }} onClick={createInvite}>
          Novo convite
        </button>
      </div>

      {invite_codes.length > 0 ? (
        invite_codes.map((inv) => (
          <div key={inv.code} style={styles.codeRow}>
            <span style={styles.codeLabel}>{roleLabel(inv.role)}</span>
            <code style={styles.code}>{inv.code}</code>
            <span style={styles.expiry}>
              {inv.use_count}/{inv.max_uses ?? "∞"} · {formatExpiry(inv.expires_at)}
            </span>
            <button style={styles.copyBtn} onClick={() => copy(inv.code, `code-${inv.code}`)}>
              {copied === `code-${inv.code}` ? "✓" : "Código"}
            </button>
            <button style={styles.copyBtn} onClick={() => copy(`${origin}/?join=${inv.code}`, `link-${inv.code}`)}>
              {copied === `link-${inv.code}` ? "✓" : "Link"}
            </button>
            <button style={styles.copyBtn} onClick={() => deleteInvite(inv.code)}>Excluir</button>
          </div>
        ))
      ) : (
        <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "8px" }}>Nenhum convite ativo</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  codes: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "4px",
    borderTop: "1px solid #2e303a",
    paddingTop: "12px",
  },
  codesTitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  activeCount: {
    color: "#9ca3af",
    fontSize: "12px",
    marginLeft: "6px",
    textTransform: "none",
  },
  codeRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  codeLabel: {
    color: "#9ca3af",
    fontSize: "11px",
    width: "44px",
    flexShrink: 0,
  },
  code: {
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    padding: "2px 8px",
    color: "#f3f4f6",
    fontSize: "13px",
    letterSpacing: "0.12em",
    flexShrink: 0,
  },
  expiry: {
    color: "#6b7280",
    fontSize: "11px",
    flex: 1,
  },
  copyBtn: {
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "11px",
    padding: "2px 8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
};