import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterSheet, Member, Role, ServerMessage, SheetTemplate } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";
import { ASSET_UPLOAD_URL, assetUrl } from "../../network/apiBase";

const FALLBACK_TEMPLATE: SheetTemplate = {
  html: '<h2 data-sheet-name></h2><label>Força <input data-field="strength" type="number" value="0"></label><button data-vtt-action="attack">Ataque</button>',
  css: "body{font:14px system-ui;color:#eee;background:#181a22;padding:12px}input{max-width:80px}button{margin:8px}",
  actions: [{ id: "attack", label: "Ataque", kind: "roll", expression: "1d20+{{strength}}" }],
};

export function SheetPanel({ sessionId, role, socket }: { sessionId: string; role: Role; socket: SocketManager }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pendingImageSheetId = useRef<string | null>(null);
  const dirty = useRef(false);
  const [sheets, setSheets] = useState<CharacterSheet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [template, setTemplate] = useState<SheetTemplate>(FALLBACK_TEMPLATE);
  const [html, setHtml] = useState(FALLBACK_TEMPLATE.html);
  const [css, setCss] = useState(FALLBACK_TEMPLATE.css);
  const [actions, setActions] = useState(JSON.stringify(FALLBACK_TEMPLATE.actions, null, 2));
  const [status, setStatus] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [newSheetName, setNewSheetName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const selected = sheets.find((sheet) => sheet.id === selectedId) ?? sheets[0];
  const selectedRef = useRef(selected);
  const selectedIdRef = useRef(selectedId);
  const actionsRef = useRef(template.actions);
  selectedRef.current = selected; selectedIdRef.current = selectedId; actionsRef.current = template.actions;

  useEffect(() => {
    const onList = (event: Event) => {
      const message = (event as CustomEvent<Extract<ServerMessage, { type: "SHEETS_LIST" }>['payload']>).detail;
      if (message.session_id !== sessionId) return;
      setSheets(message.sheets); setSelectedId((id) => message.sheets.some((sheet) => sheet.id === id) ? id : message.sheets[0]?.id ?? null);
      setTemplate(message.template); setHtml(message.template.html); setCss(message.template.css); setActions(JSON.stringify(message.template.actions, null, 2));
    };
    const onTemplate = (event: Event) => {
      const message = (event as CustomEvent<Extract<ServerMessage, { type: "SHEET_TEMPLATE_CHANGED" }>['payload']>).detail;
      if (message.session_id !== sessionId) return;
      setTemplate(message.template); setHtml(message.template.html); setCss(message.template.css); setActions(JSON.stringify(message.template.actions, null, 2));
    };
    const onChanged = (event: Event) => {
      const sheet = (event as CustomEvent<Extract<ServerMessage, { type: "SHEET_CHANGED" }>['payload']>).detail.sheet;
      setSheets((rows) => rows.some((row) => row.id === sheet.id) ? rows.map((row) => row.id === sheet.id ? sheet : row) : [...rows, sheet]);
    };
    const onMembers = (event: Event) => setMembers((event as CustomEvent<Member[]>).detail);
    const onMessage = (event: MessageEvent) => onFrameMessage(event);
    window.addEventListener("vtt-sheets-list", onList); window.addEventListener("vtt-sheet-template", onTemplate); window.addEventListener("vtt-sheet-changed", onChanged);
    window.addEventListener("message", onMessage);
    window.addEventListener("vtt-session-members", onMembers);
    socket.send({ type: "SHEETS_LIST_REQUEST", payload: {} });
    if (role === "gm") socket.send({ type: "SESSION_MEMBERS_REQUEST", payload: { session_id: sessionId } });
    return () => { window.removeEventListener("vtt-sheets-list", onList); window.removeEventListener("vtt-sheet-template", onTemplate); window.removeEventListener("vtt-sheet-changed", onChanged); window.removeEventListener("message", onMessage); window.removeEventListener("vtt-session-members", onMembers); };
  }, [sessionId, role, socket]);

  useEffect(() => {
    socket.setAssetUploadHandler("token_image", (data) => {
      if (data.type !== "BACKUP_GRANT_ISSUED" || data.payload.kind !== "asset_upload") return;
      const file = imageInput.current?.files?.[0] ?? imageFile;
      const sheetId = pendingImageSheetId.current;
      if (!file || !sheetId) return;
      void (async () => {
        try {
          setStatus("Enviando imagem da ficha…");
          const form = new FormData(); form.append("file", file);
          const query = new URLSearchParams({ token: data.payload.token, session_id: sessionId, kind: "token_image" });
          const response = await fetch(`${ASSET_UPLOAD_URL}?${query}`, { method: "POST", body: form });
          const result = await response.json() as { id?: string; error?: string };
          if (!response.ok || !result.id) throw new Error(result.error ?? "Falha ao enviar imagem.");
          socket.send({ type: "SHEET_ASSET_SET", payload: { sheet_id: sheetId, asset_id: result.id } });
          setStatus("Imagem da ficha atualizada."); setImageFile(null);
          if (imageInput.current) imageInput.current.value = "";
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Falha ao enviar imagem.");
        } finally { pendingImageSheetId.current = null; }
      })();
    });
    return () => socket.setAssetUploadHandler("token_image", null);
  }, [sessionId, socket, imageFile]);

  const srcDoc = useMemo(() => {
    const nonce = `sheet-${selectedId ?? "none"}`;
    const bridge = `(()=>{const n=${JSON.stringify(nonce)};const send=(type,extra)=>parent.postMessage({__vttSheet:n,type,...extra},'*');window.addEventListener('message',e=>{if(e.source!==parent||e.data?.__vttSheet!==n||e.data.type!=='init')return;document.querySelectorAll('[data-field]').forEach(el=>{const k=el.getAttribute('data-field');if(k in e.data.data)el.value=e.data.data[k];else send('field',{key:k,value:String(el.value??'')})});document.querySelectorAll('[data-sheet-name]').forEach(el=>el.textContent=e.data.name)});document.addEventListener('input',e=>{const el=e.target.closest?.('[data-field]');if(el)send('field',{key:el.getAttribute('data-field'),value:String(el.value??'')})});document.addEventListener('click',e=>{const el=e.target.closest?.('[data-vtt-action]');if(el){e.preventDefault();send('action',{id:el.getAttribute('data-vtt-action')})}})})();`;
    const safeHtml = template.html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    const safeCss = template.css.replace(/<\/style/gi, "<\\/style");
    const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'";
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${safeCss}</style></head><body>${safeHtml}<script>${bridge}</script></body></html>`;
  }, [template, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      if (!dirty.current) return;
      dirty.current = false;
      socket.send({ type: "SHEET_UPDATE", payload: { id: selected.id, name: selected.name, data: selected.data } });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [selected?.id, selected?.name, selected?.data, socket]);

  function onFrameMessage(event: MessageEvent) {
    const current = selectedRef.current;
    if (event.source !== frame.current?.contentWindow || event.data?.__vttSheet !== `sheet-${selectedIdRef.current ?? "none"}` || !current) return;
    if (event.data.type === "field" && typeof event.data.key === "string" && typeof event.data.value === "string") {
      dirty.current = true;
      setSheets((rows) => rows.map((sheet) => sheet.id === current.id ? { ...sheet, data: { ...sheet.data, [event.data.key]: event.data.value } } : sheet));
    }
    if (event.data.type === "action" && typeof event.data.id === "string" && actionsRef.current.some((action) => action.id === event.data.id)) {
      socket.send({ type: "SHEET_ACTION", payload: { sheet_id: current.id, action_id: event.data.id, data: current.data } });
    }
  }

  function saveTemplate() {
    try {
      const parsed = JSON.parse(actions) as SheetTemplate["actions"];
      const next = { html, css, actions: parsed };
      socket.send({ type: "SHEET_TEMPLATE_SET", payload: next });
      setStatus("Modelo salvo.");
    } catch { setStatus("A lista de ações precisa ser um JSON válido."); }
  }

  function toggleOwner(ownerId: string, checked: boolean) {
    if (!selected) return;
    const ownerIds = checked ? [...selected.owner_user_ids, ownerId] : selected.owner_user_ids.filter((id) => id !== ownerId);
    socket.send({ type: "SHEET_OWNERS_SET", payload: { sheet_id: selected.id, owner_user_ids: ownerIds } });
  }

  function uploadSheetImage() {
    if (!selected || !imageFile) { setStatus("Escolha uma imagem PNG, JPG ou WebP."); return; }
    pendingImageSheetId.current = selected.id;
    setStatus("Solicitando autorização para alterar a imagem da ficha…");
    socket.send({ type: "ASSET_UPLOAD_GRANT_REQUEST", payload: { session_id: sessionId, asset_kind: "token_image" } });
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 8, color: "#d1d5db", fontSize: 12 }}>
    <strong style={{ color: "#f3f4f6" }}>Fichas</strong>
    {role === "gm" && <details>
      <summary style={{ cursor: "pointer", marginBottom: 6 }}>Modelo HTML/CSS e ações</summary>
      <div style={{ color: "#9ca3af", marginBottom: 6 }}>Use data-field em inputs, data-sheet-name no nome e data-vtt-action no botão. As ações JSON suportam rolagem, mensagem de chat e ping no token pelo mapa.</div>
      <label>HTML<textarea value={html} onChange={(event) => setHtml(event.target.value)} style={editorStyle} /></label>
      <label>CSS<textarea value={css} onChange={(event) => setCss(event.target.value)} style={editorStyle} /></label>
      <label>Ações (JSON): roll, chat ou map/ping<textarea value={actions} onChange={(event) => setActions(event.target.value)} style={editorStyle} /></label>
      <button style={buttonStyle} onClick={saveTemplate}>Salvar modelo</button>{status && <span>{status}</span>}
    </details>}
    {role === "gm" && <div style={{ display: "flex", gap: 5 }}><input value={newSheetName} onChange={(event) => setNewSheetName(event.target.value)} placeholder="Nome da ficha" style={{ ...editorStyle, minHeight: 28 }} /><button style={buttonStyle} onClick={() => { socket.send({ type: "SHEET_CREATE", payload: { name: newSheetName.trim() || "Ficha" } }); setNewSheetName(""); }}>Criar ficha</button></div>}
    {!sheets.length ? <span style={{ color: "#9ca3af" }}>Nenhuma ficha disponível.</span> : <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {sheets.map((sheet) => <button key={sheet.id} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-vtt-sheet-id", sheet.id); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => setSelectedId(sheet.id)} style={{ ...buttonStyle, borderColor: selected?.id === sheet.id ? "#38bdf8" : "#343744", cursor: "grab" }} title="Arraste para o mapa para criar um token">{sheet.name} · {sheet.tokens.length}</button>)}
      </div>
      {selected && <>
        <label>Nome da ficha<input value={selected.name} onChange={(event) => { dirty.current = true; setSheets((rows) => rows.map((sheet) => sheet.id === selected.id ? { ...sheet, name: event.target.value } : sheet)); }} style={editorStyle} /></label>
        <div style={{ border: "1px solid #343744", borderRadius: 5, padding: 7 }}>
          <strong>Owners</strong>
          {role === "gm" ? <div style={{ display: "flex", flexDirection: "column", maxHeight: 100, overflowY: "auto" }}>{members.filter((member) => member.role === "player").map((member) => <label key={member.id}><input type="checkbox" checked={selected.owner_user_ids.includes(member.id)} onChange={(event) => toggleOwner(member.id, event.target.checked)} /> {member.nickname}</label>)}</div> : <div>{selected.owner_user_ids.length ? "Você é owner desta ficha" : ""}</div>}
          {!!selected.tokens.length && <small style={{ color: "#9ca3af" }}>Tokens em: {[...new Set(selected.tokens.map((token) => token.scene_name))].join(", ")}</small>}
        </div>
        <div style={{ border: "1px solid #343744", borderRadius: 5, padding: 7 }}>
          <strong>Imagem da ficha</strong>
          {selected.image_asset_id ? <img src={assetUrl(selected.image_asset_id)} alt={`Imagem de ${selected.name}`} style={{ display: "block", width: 72, height: 72, objectFit: "cover", borderRadius: 8, margin: "6px 0" }} /> : <div style={{ color: "#9ca3af", margin: "6px 0" }}>Sem imagem definida</div>}
          {role !== "viewer" && <>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} style={{ color: "#9ca3af", width: "100%" }} />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button style={buttonStyle} disabled={!imageFile} onClick={uploadSheetImage}>Alterar imagem</button>
              {selected.image_asset_id && <button style={buttonStyle} onClick={() => socket.send({ type: "SHEET_ASSET_SET", payload: { sheet_id: selected.id, asset_id: null } })}>Remover imagem</button>}
            </div>
          </>}
        </div>
        <iframe ref={frame} key={selected.id} title={`Ficha ${selected.name}`} sandbox="allow-scripts" srcDoc={srcDoc} onLoad={() => frame.current?.contentWindow?.postMessage({ __vttSheet: `sheet-${selected.id}`, type: "init", name: selected.name, data: selected.data }, "*")} style={{ width: "100%", height: 360, background: "#181a22", border: "1px solid #343744", borderRadius: 6 }} />
      </>}
    </>}
  </div>;
}

const editorStyle: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", minHeight: 34, padding: 6, color: "#e5e7eb", background: "#171821", border: "1px solid #343744", borderRadius: 4, margin: "4px 0" };
const buttonStyle: React.CSSProperties = { padding: "5px 8px", color: "#d1d5db", background: "#252733", border: "1px solid #343744", borderRadius: 4, cursor: "pointer", fontSize: 11 };
