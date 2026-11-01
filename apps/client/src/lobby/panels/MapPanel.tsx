import { useEffect, useRef, useState } from "react";
import type { SceneConfig, SceneMap, SceneMeasurementConfig, ServerMessage } from "@vtt/protocol";
import { ASSET_UPLOAD_URL, assetUrl } from "../../network/apiBase";
import { SocketManager } from "../../network/socket";

type MapPanelProps = {
  session_id: string;
  scene_id: string | null;
  sceneConfig: SceneConfig | null;
  map: SceneMap | null;
  measurementConfig: SceneMeasurementConfig | null;
  socket: SocketManager;
};

export function MapPanel({ session_id, scene_id, map, sceneConfig, measurementConfig, socket }: MapPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [measureMode, setMeasureMode] = useState<SceneMeasurementConfig["mode"]>("grid");
  const [unitLabel, setUnitLabel] = useState("unidades");
  const [unitsPerCell, setUnitsPerCell] = useState(1);
  const [snapToCells, setSnapToCells] = useState(false);
  const [editableSceneConfig, setEditableSceneConfig] = useState<SceneConfig | null>(sceneConfig);

  useEffect(() => {
    if (!measurementConfig) return;
    setMeasureMode(measurementConfig.mode);
    setUnitLabel(measurementConfig.unit_label);
    setUnitsPerCell(measurementConfig.units_per_cell);
    setSnapToCells(measurementConfig.snap_to_cell_centers);
  }, [measurementConfig]);

  useEffect(() => setEditableSceneConfig(sceneConfig), [sceneConfig]);

  useEffect(() => {
    socket.setAssetUploadHandler("map_image", (data: ServerMessage) => {
      if (data.type !== "BACKUP_GRANT_ISSUED" || data.payload.kind !== "asset_upload") return;
      const file = pendingFile.current;
      if (!file) return;
      void uploadMap(file, data.payload.token);
    });
    return () => {
      socket.setAssetUploadHandler("map_image", null);
      window.dispatchEvent(new CustomEvent("vtt-map-edit", { detail: { editing: false } }));
    };
  }, [socket]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("vtt-map-edit", { detail: { editing } }));
  }, [editing]);

  async function uploadMap(file: File, grant: string) {
    try {
      if (!scene_id) throw new Error("Entre em uma cena antes de enviar o mapa.");
      if (file.size > 25 * 1024 * 1024) throw new Error("O limite de tamanho do mapa é 25 MB.");

      setStatus("Preparando mapa…");
      const bitmap = await createImageBitmap(file);
      const scale = Math.max(
        0.05,
        Math.min(
          (window.innerWidth * 0.65) / bitmap.width,
          (window.innerHeight * 0.85) / bitmap.height,
          10,
        ),
      );
      const x = Math.max(0, (window.innerWidth * 0.65 - bitmap.width * scale) / 2);
      const y = Math.max(0, (window.innerHeight - bitmap.height * scale) / 2);
      bitmap.close();

      setStatus("Enviando mapa…");
      const formData = new FormData();
      formData.append("file", file);
      const query = new URLSearchParams({ token: grant, session_id, kind: "map_image" });
      const response = await fetch(`${ASSET_UPLOAD_URL}?${query}`, { method: "POST", body: formData });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Falha ao enviar o mapa.");

      socket.send({
        type: "SCENE_MAP_SET",
        payload: { scene_id, asset_id: result.id, x, y, scale },
      });
      setEditing(true);
      setStatus("Mapa enviado. Arraste-o no canvas; use o círculo no canto inferior direito para redimensionar.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao enviar o mapa.");
    } finally {
      pendingFile.current = null;
    }
  }

  function requestUpload(file: File | undefined) {
    if (!file) return;
    if (!scene_id) {
      setStatus("Entre em uma cena antes de enviar o mapa.");
      return;
    }
    pendingFile.current = file;
    setStatus("Solicitando autorização de upload…");
    socket.send({
      type: "ASSET_UPLOAD_GRANT_REQUEST",
      payload: { session_id, asset_kind: "map_image" },
    });
  }

  function removeMap() {
    if (!scene_id) return;
    setEditing(false);
    socket.send({ type: "SCENE_MAP_SET", payload: { scene_id, asset_id: null } });
    setStatus("Mapa removido desta cena.");
  }

  function saveMeasurementConfig() {
    if (!scene_id) return;
    socket.send({ type: "SCENE_MEASURE_CONFIG_SET", payload: {
      scene_id,
      config: { mode: measureMode, unit_label: unitLabel.trim() || "unidades", units_per_cell: Number(unitsPerCell), snap_to_cell_centers: snapToCells },
    } });
    setStatus("Configuração da régua salva nesta cena.");
  }

  function saveGridConfig() {
    if (!scene_id || !editableSceneConfig) return;
    socket.send({ type: "SCENE_CONFIG_SET", payload: { scene_id, ...editableSceneConfig } });
    setStatus("Configuração do grid salva nesta cena.");
  }

  return (
    <div style={styles.panel}>
      <p style={styles.title}>Mapa da cena</p>
      <p style={styles.note}>
        {scene_id ? "O mapa fica atrás da grade e dos tokens, e é salvo nesta cena." : "Entre em uma cena para gerenciar o mapa."}
      </p>
      <div style={styles.measureConfig}>
        <p style={styles.title}>Régua desta cena</p>
        <select value={measureMode} onChange={(event) => setMeasureMode(event.target.value as SceneMeasurementConfig["mode"])} disabled={!scene_id}>
          <option value="grid">Células da grade</option>
          <option value="custom">Unidade própria</option>
          <option value="free">Distância livre</option>
        </select>
        {measureMode === "custom" && <>
          <input value={unitLabel} maxLength={40} onChange={(event) => setUnitLabel(event.target.value)} placeholder="feet, metro, dias de caminhada" />
          <label style={styles.note}>Unidades por célula
            <input type="number" min="0.001" max="1000000" step="any" value={unitsPerCell}
              onChange={(event) => setUnitsPerCell(Number(event.target.value))} />
          </label>
        </>}
        <label style={styles.note}>
          <input type="checkbox" checked={snapToCells} onChange={(event) => setSnapToCells(event.target.checked)} />
          Ajustar início e fim ao centro das células
        </label>
        <button style={styles.button} onClick={saveMeasurementConfig} disabled={!scene_id}>Salvar modo da régua</button>
      </div>
      <div style={styles.measureConfig}>
        <p style={styles.title}>Grade da cena</p>
        {editableSceneConfig && <>
          <label style={styles.note}>Formato
            <select value={editableSceneConfig.grid_type} onChange={(event) => setEditableSceneConfig({ ...editableSceneConfig, grid_type: event.target.value as SceneConfig["grid_type"] })}>
              <option value="square">Quadrado</option>
              <option value="hex_pointy">Hexagonal (pontas)</option>
              <option value="hex_flat">Hexagonal (lados)</option>
              <option value="none">Sem grade</option>
            </select>
          </label>
          <label style={styles.note}>Tamanho da célula
            <input type="number" min="10" max="500" step="1" value={editableSceneConfig.grid_size}
              onChange={(event) => setEditableSceneConfig({ ...editableSceneConfig, grid_size: Number(event.target.value) })} />
          </label>
          <label style={styles.note}>Cor da grade
            <input type="color" value={editableSceneConfig.grid_color}
              onChange={(event) => setEditableSceneConfig({ ...editableSceneConfig, grid_color: event.target.value })} />
          </label>
          <label style={styles.note}>Opacidade: {Math.round(editableSceneConfig.grid_opacity * 100)}%
            <input type="range" min="0" max="100" value={editableSceneConfig.grid_opacity * 100}
              onChange={(event) => setEditableSceneConfig({ ...editableSceneConfig, grid_opacity: Number(event.target.value) / 100 })} />
          </label>
          <button style={styles.button} onClick={saveGridConfig} disabled={!scene_id}>Salvar grade</button>
        </>}
      </div>
      {map && (
        <div style={styles.preview}>
          <img src={assetUrl(map.asset_id)} alt="Mapa atual da cena" style={styles.image} />
          <span style={styles.note}>Escala: {Math.round(map.scale * 100)}%</span>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => requestUpload(event.target.files?.[0])}
        style={styles.fileInput}
        disabled={!scene_id}
      />
      <div style={styles.actions}>
        <button style={styles.button} onClick={() => fileInputRef.current?.click()} disabled={!scene_id}>
          {map ? "Trocar mapa" : "Enviar mapa"}
        </button>
        {map && (
          <>
            <button
              style={{ ...styles.button, ...(editing ? styles.activeButton : {}) }}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Concluir ajuste" : "Mover / redimensionar"}
            </button>
            <button style={styles.button} onClick={removeMap}>Remover mapa</button>
          </>
        )}
      </div>
      {map && <p style={styles.note}>Ao ajustar: arraste o mapa para mover; arraste o círculo no canto inferior direito para redimensioná-lo proporcionalmente.</p>}
      {status && <p style={styles.status}>{status}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" },
  title: { margin: 0, color: "#9ca3af", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" },
  note: { margin: 0, color: "#9ca3af", fontSize: "12px", lineHeight: 1.45 },
  preview: { display: "flex", alignItems: "center", gap: "10px" },
  measureConfig: { display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid #2e303a", paddingTop: 10 },
  image: { width: "64px", height: "48px", objectFit: "cover", borderRadius: "4px", background: "#0f1115" },
  fileInput: { display: "none" },
  actions: { display: "flex", flexWrap: "wrap", gap: "6px" },
  button: {
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "11px",
    padding: "5px 8px",
  },
  // activeButton: { borderColor: "#38bdf8", color: "#bae6fd" },
  activeButton: { border: "1px solid #38bdf8", color: "#bae6fd" },
  status: { margin: 0, color: "#bae6fd", fontSize: "12px", lineHeight: 1.45 },
};
