import { useEffect, useRef, useState } from "react";
import type { Role, ServerMessage } from "@vtt/protocol";
import { ASSET_UPLOAD_URL } from "../../network/apiBase";
import { SocketManager } from "../../network/socket";

type TokenPanelProps = {
  role: Role;
  session_id: string;
  default_token_asset_id: string | null;
  socket: SocketManager;
};

type UploadAction = "create" | "replace" | "default";

export function TokenPanel({ role, session_id, default_token_asset_id, socket }: TokenPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAction = useRef<UploadAction | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    socket.setAssetUploadHandler("token_image", (data: ServerMessage) => {
      if (data.type !== "BACKUP_GRANT_ISSUED" || data.payload.kind !== "asset_upload") return;
      const selectedFile = fileInputRef.current?.files?.[0] ?? file;
      const action = pendingAction.current;
      if (!selectedFile || !action) return;

      void uploadTokenImage(selectedFile, data.payload.token, action);
    });
    return () => socket.setAssetUploadHandler("token_image", null);
  }, [socket, file]);

  async function uploadTokenImage(selectedFile: File, grant: string, action: UploadAction) {
    try {
      setStatus("Enviando imagem…");
      const formData = new FormData();
      formData.append("file", selectedFile);
      const query = new URLSearchParams({ token: grant, session_id, kind: "token_image" });
      const response = await fetch(`${ASSET_UPLOAD_URL}?${query}`, { method: "POST", body: formData });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Falha ao enviar imagem.");

      if (action === "default") {
        socket.send({ type: "SESSION_SET_DEFAULT_TOKEN_ASSET", payload: { asset_id: result.id } });
        setStatus("Imagem enviada; definindo-a como padrão da sessão…");
      } else {
        const eventName = action === "create" ? "vtt-create-token" : "vtt-set-selected-token-image";
        window.dispatchEvent(new CustomEvent(eventName, { detail: { assetId: result.id } }));
        setStatus(action === "create" ? "Imagem enviada; token criado." : "Imagem aplicada ao token selecionado.");
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao enviar imagem.");
    } finally {
      pendingAction.current = null;
    }
  }

  function requestUpload(action: UploadAction) {
    if (!file) {
      setStatus("Escolha uma imagem PNG, JPG ou WebP.");
      return;
    }
    pendingAction.current = action;
    setStatus("Solicitando autorização de upload…");
    socket.send({ type: "ASSET_UPLOAD_GRANT_REQUEST", payload: { session_id } });
  }

  return (
    <div style={{ marginTop: "8px" }}>
      <p style={styles.codesTitle}>Tokens</p>
      {role === "viewer" ? (
        <div style={{ color: "#6b7280", fontSize: "12px" }}>Visualizadores não podem criar tokens</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            style={{ ...styles.copyBtn, background: "#aa3bff", color: "#fff", border: "none" }}
            onClick={() => window.dispatchEvent(new CustomEvent("vtt-create-token"))}
          >
            {/* ➕ */}
            +
          </button>
          <div style={{ color: "#9ca3af", fontSize: "12px" }}>Clique para criar um token centralizado</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setStatus(null);
            }}
            style={{ color: "#9ca3af", fontSize: "12px" }}
          />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button style={styles.copyBtn} onClick={() => requestUpload("create")}>Enviar e criar token</button>
            <button style={styles.copyBtn} onClick={() => requestUpload("replace")}>Aplicar ao token selecionado</button>
            {role === "gm" && <button style={styles.copyBtn} onClick={() => requestUpload("default")}>Definir como padrão</button>}
          </div>
          {role === "gm" && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                Padrão da sessão: {default_token_asset_id ? "imagem configurada" : "quadrado branco"}
              </span>
              {default_token_asset_id && (
                <button
                  style={styles.copyBtn}
                  onClick={() => socket.send({ type: "SESSION_SET_DEFAULT_TOKEN_ASSET", payload: { asset_id: null } })}
                >
                  Remover padrão
                </button>
              )}
            </div>
          )}
          {status && <div style={{ color: "#9ca3af", fontSize: "12px" }}>{status}</div>}
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
