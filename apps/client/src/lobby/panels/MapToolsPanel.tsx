import { useEffect, useState } from "react";
import type { SceneMeasurementConfig } from "@vtt/protocol";

type Tool = "select" | "measurement" | "line" | "ellipse" | "polygon" | "freehand";

const tools: { id: Tool; label: string }[] = [
  { id: "select", label: "Selecionar / mover" },
  { id: "measurement", label: "Medir" },
  { id: "line", label: "Reta" },
  { id: "ellipse", label: "Elipse" },
  { id: "polygon", label: "Polígono" },
  { id: "freehand", label: "Mão livre" },
];

export function MapToolsPanel({ sceneId, config }: { sceneId: string | null; config: SceneMeasurementConfig | null }) {
  const [tool, setTool] = useState<Tool>("select");
  const [shared, setShared] = useState(false);
  const [keep, setKeep] = useState(false);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("vtt-map-tool", { detail: { tool } }));
    return () => { window.dispatchEvent(new CustomEvent("vtt-map-tool", { detail: { tool: "select" } })); };
  }, [tool]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("vtt-map-tool-settings", { detail: { shared, keep } }));
  }, [shared, keep]);

  return (
    <div style={styles.panel}>
      <p style={styles.title}>Ferramentas do mapa</p>
      {!sceneId && <p style={styles.note}>Entre em uma cena para usar as ferramentas.</p>}
      <div style={styles.tools}>
        {tools.map((item) => (
          <button key={item.id} disabled={!sceneId} onClick={() => setTool(item.id)}
            style={{ ...styles.button, ...(tool === item.id ? styles.active : {}) }}>
            {item.label}
          </button>
        ))}
      </div>
      <p style={styles.note}>
        {config?.mode === "grid" ? "A régua mede em células da grade." :
          config?.mode === "custom" ? `A régua mede em ${config.unit_label}.` :
            config?.mode === "free" ? "A régua mede distância livre em pixels do mapa." : "O mestre define o modo da régua por cena."}
      </p>
      {tool === "measurement" && (
        <div style={styles.options}>
          <label><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /> Compartilhar medição</label>
          <label><input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} /> Manter no mapa</label>
          <p style={styles.note}>Clique no mapa ou em um token para iniciar; clique com o botão direito para marcar curvas e clique esquerdo para concluir. Esc cancela.</p>
        </div>
      )}
      {tool === "polygon" && <p style={styles.note}>Clique para adicionar pontos; dê duplo clique para fechar.</p>}
      <button disabled={!sceneId} style={styles.button} onClick={() => window.dispatchEvent(new CustomEvent("vtt-delete-selected-drawing"))}>
        Apagar desenho selecionado
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  title: { margin: 0, color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" },
  note: { margin: 0, color: "#9ca3af", fontSize: 12, lineHeight: 1.45 },
  tools: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  options: { display: "flex", flexDirection: "column", gap: 5, color: "#d1d5db", fontSize: 12 },
  button: { background: "transparent", border: "1px solid #2e303a", borderRadius: 4, color: "#d1d5db", cursor: "pointer", fontSize: 11, padding: "6px 8px" },
  active: { borderColor: "#38bdf8", color: "#bae6fd", background: "#172633" },
};
