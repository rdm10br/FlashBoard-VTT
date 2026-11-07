import { useEffect, useMemo, useState } from "react";
import type { CharacterSheet, ServerMessage } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";

const DICE = [20, 4, 6, 8, 10, 12, 100] as const;
const MAX_COUNT = 1000; // o limite real da sessão é validado no servidor
const isInt = (value: string) => /^-?\d+$/.test(value.trim());

type Keep = "all" | "kh" | "kl";
type Group = { count: string; keep: Keep; keepN: string };
const EMPTY: Group = { count: "", keep: "all", keepN: "1" };

function countOf(group: Group): number {
  const n = parseInt(group.count, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_COUNT, n)) : 0;
}

function keepOf(group: Group, count: number): number {
  const n = parseInt(group.keepN, 10);
  return Math.max(1, Math.min(count, Number.isFinite(n) ? n : 1));
}

export function DiceRollerPanel({
  sessionId,
  socket,
}: {
  sessionId: string;
  socket: SocketManager;
}) {
  const [sheets, setSheets] = useState<CharacterSheet[]>([]);
  const [groups, setGroups] = useState<Record<number, Group>>({});
  const [rawBonus, setRawBonus] = useState("0");
  const [useAttr, setUseAttr] = useState(false);
  const [sheetId, setSheetId] = useState("");
  const [field, setField] = useState("");
  const [attrSign, setAttrSign] = useState<1 | -1>(1);
  const [label, setLabel] = useState("");

  useEffect(() => {
    const onList = (event: Event) => {
      const message = (
        event as CustomEvent<
          Extract<ServerMessage, { type: "SHEETS_LIST" }>["payload"]
        >
      ).detail;
      if (message.session_id === sessionId) setSheets(message.sheets);
    };
    const onChanged = (event: Event) => {
      const sheet = (event as CustomEvent<{ sheet: CharacterSheet }>).detail
        .sheet;
      setSheets((rows) =>
        rows.some((row) => row.id === sheet.id)
          ? rows.map((row) => (row.id === sheet.id ? sheet : row))
          : [...rows, sheet],
      );
    };
    window.addEventListener("vtt-sheets-list", onList);
    window.addEventListener("vtt-sheet-changed", onChanged);
    socket.send({ type: "SHEETS_LIST_REQUEST", payload: {} });
    return () => {
      window.removeEventListener("vtt-sheets-list", onList);
      window.removeEventListener("vtt-sheet-changed", onChanged);
    };
  }, [sessionId, socket]);

  const sheet = sheets.find((item) => item.id === sheetId) ?? sheets[0];
  const numericFields = useMemo(
    () => Object.entries(sheet?.data ?? {}).filter(([, value]) => isInt(value)),
    [sheet],
  );
  const selectedField = numericFields.some(([key]) => key === field)
    ? field
    : (numericFields[0]?.[0] ?? "");
  const attrValue =
    useAttr && sheet && selectedField
      ? Number(sheet.data[selectedField]) * attrSign
      : 0;
  const raw = isInt(rawBonus) ? Number(rawBonus) : 0;

  function groupOf(sides: number): Group {
    return groups[sides] ?? EMPTY;
  }

  function patch(sides: number, changes: Partial<Group>) {
    setGroups((current) => ({
      ...current,
      [sides]: { ...(current[sides] ?? EMPTY), ...changes },
    }));
  }

  // Atalho estilo Roll20/Foundry: 2d20 mantendo o maior (ou o menor).
  function d20Preset(keep: "kh" | "kl") {
    patch(20, { count: "2", keep, keepN: "1" });
  }

  const { expression, text } = useMemo(() => {
    const parts: string[] = [];
    for (const sides of DICE) {
      const group = groups[sides] ?? EMPTY;
      const n = countOf(group);
      if (n === 0) continue;
      let part = `${n}d${sides}`;
      if (group.keep !== "all") part += `${group.keep}${keepOf(group, n)}`;
      parts.push(parts.length ? `+${part}` : part);
    }
    if (!parts.length) return { expression: "", text: "" };
    for (const bonus of [raw, attrValue]) {
      if (bonus !== 0) parts.push(`${bonus > 0 ? "+" : "-"}${Math.abs(bonus)}`);
    }
    const expr = parts.join("");
    const autoLabel =
      useAttr && sheet && selectedField
        ? `${sheet.name} - ${selectedField}`
        : "";
    const finalLabel = (label.trim() || autoLabel).slice(0, 50);
    return {
      expression: expr,
      text: `/roll ${expr}${finalLabel ? ` ${finalLabel}` : ""}`,
    };
  }, [groups, raw, attrValue, label, useAttr, sheet, selectedField]);

  function roll() {
    if (!text) return;
    socket.send({ type: "CHAT_SEND", payload: { text } });
  }

  return (
    <div style={styles.panel}>
      <p style={styles.title}>Dados</p>

      <div style={{ display: "flex", gap: 6 }}>
        <button style={styles.small} onClick={() => d20Preset("kh")}>
          d20 com vantagem
        </button>
        <button style={styles.small} onClick={() => d20Preset("kl")}>
          d20 com desvantagem
        </button>
      </div>

      <div style={styles.list}>
        {DICE.map((sides) => {
          const group = groupOf(sides);
          const n = countOf(group);
          return (
            <div key={sides} style={styles.die}>
              <strong style={{ color: "#f3f4f6", width: 36 }}>d{sides}</strong>
              <input
                type="number"
                min={0}
                max={MAX_COUNT}
                placeholder="0"
                value={group.count}
                onChange={(e) => patch(sides, { count: e.target.value })}
                style={{ ...styles.input, width: 60 }}
                aria-label={`Quantidade de d${sides}`}
              />
              <select
                value={group.keep}
                onChange={(e) => patch(sides, { keep: e.target.value as Keep })}
                style={{ ...styles.input, flex: 1, minWidth: 0 }}
                aria-label={`Regra do d${sides}`}
              >
                <option value="all">Somar todos</option>
                <option value="kh">Vantagem (manter maiores)</option>
                <option value="kl">Desvantagem (manter menores)</option>
              </select>
              {group.keep !== "all" && (
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, n)}
                  value={group.keepN}
                  onChange={(e) => patch(sides, { keepN: e.target.value })}
                  style={{ ...styles.input, width: 50 }}
                  title="Quantos dados manter"
                  aria-label={`Quantos d${sides} manter`}
                />
              )}
            </div>
          );
        })}
      </div>
      <span style={styles.note}>
        Com vantagem/desvantagem, o número ao lado é quantos dados do grupo são
        mantidos (ex.: 3d20, manter 2 maiores).
      </span>

      <label style={styles.row}>
        Bônus bruto
        <input
          type="number"
          step={1}
          value={rawBonus}
          onChange={(e) => setRawBonus(e.target.value)}
          style={{ ...styles.input, width: 80 }}
        />
      </label>

      <label style={styles.row}>
        <input
          type="checkbox"
          checked={useAttr}
          onChange={(e) => setUseAttr(e.target.checked)}
        />
        Somar atributo da ficha
      </label>
      {useAttr &&
        (sheets.length === 0 ? (
          <span style={styles.note}>Nenhuma ficha disponível.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <select
              value={sheet?.id ?? ""}
              onChange={(e) => setSheetId(e.target.value)}
              style={styles.input}
            >
              {sheets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {numericFields.length === 0 ? (
              <span style={styles.note}>
                Esta ficha não tem campos numéricos preenchidos.
              </span>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  value={selectedField}
                  onChange={(e) => setField(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                >
                  {numericFields.map(([key, value]) => (
                    <option key={key} value={key}>
                      {key} ({value})
                    </option>
                  ))}
                </select>
                <select
                  value={attrSign}
                  onChange={(e) =>
                    setAttrSign(Number(e.target.value) as 1 | -1)
                  }
                  style={styles.input}
                >
                  <option value={1}>+</option>
                  <option value={-1}>−</option>
                </select>
              </div>
            )}
          </div>
        ))}

      <input
        placeholder="Rótulo (opcional)"
        maxLength={50}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={styles.input}
      />

      <code style={styles.preview}>{text || "Escolha ao menos um dado"}</code>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={styles.roll} onClick={roll} disabled={!expression}>
          🎲 Rolar
        </button>
        <button
          style={styles.small}
          onClick={() => {
            setGroups({});
            setRawBonus("0");
            setLabel("");
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#d1d5db",
    fontSize: 12,
  },
  title: {
    margin: 0,
    color: "#9ca3af",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  die: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: "#17181f",
    border: "1px solid #2e303a",
    borderRadius: 6,
  },
  row: { display: "flex", alignItems: "center", gap: 8 },
  input: {
    padding: 5,
    background: "#0f172a",
    color: "#f3f4f6",
    border: "1px solid #343744",
    borderRadius: 4,
  },
  note: { color: "#9ca3af", fontSize: 11 },
  small: {
    background: "transparent",
    border: "1px solid #343744",
    borderRadius: 4,
    color: "#d1d5db",
    cursor: "pointer",
    padding: "2px 8px",
  },
  preview: {
    padding: 6,
    background: "#0f1115",
    borderRadius: 4,
    color: "#bae6fd",
    wordBreak: "break-all",
  },
  roll: {
    flex: 1,
    padding: 8,
    background: "#aa3bff",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
};