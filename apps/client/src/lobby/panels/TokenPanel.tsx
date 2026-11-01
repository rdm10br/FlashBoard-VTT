import type { Role } from "@vtt/protocol";

export function TokenPanel({ role }: { role: Role }) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={styles.codesTitle}>Tokens</p>
      {role === "viewer" ? (
        <div style={{ color: "#6b7280", fontSize: 12 }}>Visualizadores não podem criar tokens</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={{ ...styles.copyBtn, background: "#aa3bff", color: "#fff", border: "none" }} onClick={() => window.dispatchEvent(new CustomEvent("vtt-create-token"))}>+</button>
            <div style={{ color: "#9ca3af", fontSize: 12 }}>Criar uma ficha e seu primeiro token</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={styles.copyBtn} onClick={() => window.dispatchEvent(new CustomEvent("vtt-delete-selected-token"))}>Remover token selecionado</button>
            <span style={{ color: "#6b7280", fontSize: 12 }}>ou tecla Delete</span>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  codesTitle: { margin: 0, color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" },
  copyBtn: { background: "transparent", border: "1px solid #2e303a", borderRadius: 4, color: "#9ca3af", cursor: "pointer", fontSize: 11, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 },
};
