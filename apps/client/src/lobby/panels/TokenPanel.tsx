import type { Role } from "@vtt/protocol";

type TokenPanelProps = {
  role: Role;
};

export function TokenPanel({ role }: TokenPanelProps) {
  return (
    <div style={{ marginTop: "8px" }}>
      <p style={styles.codesTitle}>Tokens</p>
      {role === "viewer" ? (
        <div style={{ color: "#6b7280", fontSize: "12px" }}>Visualizadores não podem criar tokens</div>
      ) : (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            style={{ ...styles.copyBtn, background: "#aa3bff", color: "#fff", border: "none" }}
            onClick={() => window.dispatchEvent(new CustomEvent("vtt-create-token"))}
          >
            ➕
          </button>
          <div style={{ color: "#9ca3af", fontSize: "12px" }}>Clique para criar um token centralizado</div>
        </div>
      )}
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