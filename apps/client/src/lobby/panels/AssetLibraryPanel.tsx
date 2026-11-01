import type { SessionAsset } from "@vtt/protocol";
import { assetUrl } from "../../network/apiBase";
import { SocketManager } from "../../network/socket";

type AssetLibraryPanelProps = {
  assets: SessionAsset[];
  error: string | null;
  socket: SocketManager;
};

export function AssetLibraryPanel({ assets, error, socket }: AssetLibraryPanelProps) {
  function requestDelete(asset: SessionAsset) {
    const kind = asset.kind === "map_image" ? "mapa" : "imagem de token";
    const confirmed = window.confirm(
      `Excluir ${kind} “${asset.filename}”? Se estiver em uso, ele será removido dos mapas, fichas e imagem padrão da sessão.`,
    );
    if (!confirmed) return;
    socket.send({ type: "ASSET_DELETE_REQUEST", payload: { asset_id: asset.id } });
  }

  return (
    <section style={styles.panel}>
      <div style={styles.header}>
        <p style={styles.title}>Arquivos da sessão</p>
        <span style={styles.count}>{assets.length}</span>
      </div>
      <p style={styles.note}>Exclusão também remove o arquivo dos mapas, fichas e padrão da sessão, quando estiver associado.</p>
      {assets.length === 0 ? (
        <p style={styles.note}>Nenhum arquivo enviado.</p>
      ) : (
        <div style={styles.list}>
          {assets.map((asset) => (
            <div key={asset.id} style={styles.row}>
              <img src={assetUrl(asset.id)} alt="" style={styles.preview} />
              <div style={styles.details}>
                <strong style={styles.filename} title={asset.filename}>{asset.filename}</strong>
                <span style={styles.note}>
                  {asset.kind === "map_image" ? "Mapa" : "Token"} · {formatSize(asset.size_bytes)}
                </span>
              </div>
              <button style={styles.deleteButton} onClick={() => requestDelete(asset)}>Excluir</button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" style={styles.error}>{error}</p>}
    </section>
  );
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", gap: "7px", marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #2e303a" },
  header: { display: "flex", alignItems: "center", gap: "8px" },
  title: { margin: 0, color: "#9ca3af", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" },
  count: { color: "#6b7280", fontSize: "11px" },
  note: { margin: 0, color: "#6b7280", fontSize: "11px", lineHeight: 1.4 },
  list: { display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" },
  row: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, padding: "5px", background: "#17181f", borderRadius: "5px" },
  preview: { width: "42px", height: "34px", flexShrink: 0, objectFit: "cover", borderRadius: "3px", background: "#0f1115" },
  details: { display: "flex", flex: 1, flexDirection: "column", minWidth: 0, gap: "3px" },
  filename: { color: "#e5e7eb", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  deleteButton: { background: "transparent", border: "1px solid #7f3038", borderRadius: "4px", color: "#fca5a5", cursor: "pointer", fontSize: "11px", padding: "3px 7px", flexShrink: 0 },
  error: { margin: 0, color: "#fca5a5", fontSize: "11px" },
};
