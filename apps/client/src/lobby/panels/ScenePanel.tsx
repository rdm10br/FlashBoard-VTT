import { useEffect, useState } from "react";
import type { Role, Scene, ScenePartyMember } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";

export function ScenePanel({ sessionId, role, scenes, party, partySceneId, currentSceneId, socket, onConfigure }: {
  sessionId: string; role: Role; scenes: Scene[]; party: ScenePartyMember[]; partySceneId: string | null;
  currentSceneId: string | null; socket: SocketManager; onConfigure: () => void;
}) {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState(currentSceneId ?? "");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});
  const gm = role === "gm";

  useEffect(() => { socket.send({ type: "SCENE_LIST_REQUEST", payload: {} }); }, [sessionId, socket]);
  useEffect(() => { if (currentSceneId) setDestination(currentSceneId); }, [currentSceneId]);
  useEffect(() => setRenameValues(Object.fromEntries(scenes.map((scene) => [scene.id, scene.name]))), [scenes]);

  function moveScene(index: number, delta: number) {
    const next = [...scenes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    socket.send({ type: "SCENE_REORDER", payload: { scene_ids: next.map((scene) => scene.id) } });
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "#d1d5db", fontSize: 12 }}>
    <strong style={{ color: "#f3f4f6" }}>Cenas</strong>
    {gm && <div style={{ display: "flex", gap: 6 }}>
      <input value={name} maxLength={80} placeholder="Nome da cena" onChange={(event) => setName(event.target.value)} style={inputStyle} />
      <button style={buttonStyle} disabled={!name.trim()} onClick={() => { socket.send({ type: "SCENE_CREATE", payload: { name: name.trim() } }); setName(""); }}>Criar</button>
    </div>}
    {partySceneId && <div style={{ color: "#86efac" }}>Party está em: {scenes.find((scene) => scene.id === partySceneId)?.name ?? "cena"}</div>}
    {scenes.map((scene, index) => {
      const members = party.filter((member) => member.scene_id === scene.id);
      return <div key={scene.id} style={{ border: "1px solid #343744", borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {gm ? <input value={renameValues[scene.id] ?? scene.name} onChange={(event) => setRenameValues((values) => ({ ...values, [scene.id]: event.target.value }))} style={{ ...inputStyle, flex: 1 }} /> : <strong style={{ flex: 1 }}>{scene.name}</strong>}
          {partySceneId === scene.id && <span style={{ color: "#86efac" }}>Party</span>}
          <button style={buttonStyle} onClick={() => socket.send({ type: "SCENE_SWITCH", payload: { scene_id: scene.id } })}>{currentSceneId === scene.id ? "Atual" : "Abrir"}</button>
        </div>
        {gm && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button style={buttonStyle} disabled={!(renameValues[scene.id] ?? scene.name).trim()} onClick={() => socket.send({ type: "SCENE_RENAME", payload: { scene_id: scene.id, name: (renameValues[scene.id] ?? scene.name).trim() } })}>Renomear</button>
          <button style={buttonStyle} onClick={() => socket.send({ type: "SCENE_SET_VISIBLE", payload: { scene_id: scene.id, visible: !scene.is_visible } })}>{scene.is_visible ? "Ocultar" : "Publicar"}</button>
          <button style={buttonStyle} onClick={() => moveScene(index, -1)} disabled={index === 0}>↑</button>
          <button style={buttonStyle} onClick={() => moveScene(index, 1)} disabled={index === scenes.length - 1}>↓</button>
          <button style={buttonStyle} onClick={() => { if (window.confirm(`Excluir a cena “${scene.name}” e seu conteúdo?`)) socket.send({ type: "SCENE_DELETE", payload: { scene_id: scene.id } }); }}>Excluir</button>
          <button style={buttonStyle} onClick={() => { socket.send({ type: "SCENE_SWITCH", payload: { scene_id: scene.id } }); onConfigure(); }}>Configurar mapa/grid</button>
        </div>}
        <div style={{ color: "#9ca3af" }}>{members.length ? members.map((member) => `${member.nickname}${member.online ? " • online" : ""}`).join(", ") : "Nenhum player nesta cena"}</div>
      </div>;
    })}
    {gm && party.length > 0 && <div style={{ borderTop: "1px solid #343744", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <strong>Distribuir players</strong>
      <select value={destination} onChange={(event) => setDestination(event.target.value)} style={inputStyle}>
        <option value="">Cena de destino</option>{scenes.filter((scene) => scene.is_visible).map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
      </select>
      {party.map((member) => <label key={member.user_id}>
        <input type="checkbox" checked={selectedPlayers.includes(member.user_id)} onChange={(event) => setSelectedPlayers((ids) => event.target.checked ? [...ids, member.user_id] : ids.filter((id) => id !== member.user_id))} /> {member.nickname}{member.online ? " (online)" : " (offline)"}
      </label>)}
      <div style={{ display: "flex", gap: 6 }}>
        <button style={buttonStyle} disabled={!destination || !selectedPlayers.length} onClick={() => socket.send({ type: "SCENE_ASSIGN_PLAYERS", payload: { scene_id: destination, user_ids: selectedPlayers } })}>Enviar selecionados</button>
        <button style={buttonStyle} disabled={!destination} onClick={() => socket.send({ type: "SCENE_PUSH", payload: { scene_id: destination } })}>Enviar Party toda</button>
      </div>
    </div>}
  </div>;
}

const inputStyle: React.CSSProperties = { minWidth: 0, padding: "6px", color: "#e5e7eb", background: "#171821", border: "1px solid #343744", borderRadius: 4 };
const buttonStyle: React.CSSProperties = { padding: "5px 8px", color: "#d1d5db", background: "#252733", border: "1px solid #343744", borderRadius: 4, cursor: "pointer", fontSize: 11 };
