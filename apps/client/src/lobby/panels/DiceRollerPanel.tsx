import { useEffect, useMemo, useState } from "react";
import type { CharacterSheet, ServerMessage } from "@vtt/protocol";
import { SocketManager } from "../../network/socket";

// d20 primeiro: /adv e /dis exigem que o primeiro termo de dados seja 1d20.
const DICE = [20, 4, 6, 8, 10, 12, 100] as const;
type Mode = "normal" | "adv" | "dis";
const isInt = (value: string) => /^-?\d+$/.test(value.trim());

export function DiceRollerPanel({
  sessionId,
  socket,
}: {
  sessionId: string;
  socket: SocketManager;
}) {
  const [sheets, setSheets] = useState<CharacterSheet[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [rawBonus, setRawBonus] = useState("0");
  const [useAttr, setUseAttr] = useState(false);
  const [sheetId, setSheetId] = useState("");
  const [field, setField] = useState("");
  const [attrSign, setAttrSign] = useState<1 | -1>(1);
  const [mode, setMode] = useState<Mode>("normal");
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

  // Vantagem/desvantagem só valem para exatamente 1d20.
  // const canAdvantage = counts[20] === 1;
  const canAdvantage = true;
  const effectiveMode: Mode = canAdvantage ? mode : "normal";

  const { expression, text } = useMemo(() => {
    const parts: string[] = [];
    for (const sides of DICE) {
      const n = counts[sides] ?? 0;
      if (n > 0) parts.push(`${parts.length ? "+" : ""}${n}d${sides}`);
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
    const command =
      effectiveMode === "adv"
        ? "/adv"
        : effectiveMode === "dis"
          ? "/dis"
          : "/roll";
    return {
      expression: expr,
      text: `${command} ${expr}${finalLabel ? ` ${finalLabel}` : ""}`,
    };
  }, [
    counts,
    raw,
    attrValue,
    label,
    useAttr,
    sheet,
    selectedField,
    effectiveMode,
  ]);

  function change(sides: number, delta: number) {
    setCounts((current) => ({
      ...current,
      [sides]: Math.max(0, Math.min(99, (current[sides] ?? 0) + delta)),
    }));
  }

  function roll() {
    if (!text) return;
    socket.send({ type: "CHAT_SEND", payload: { text } });
  }

  return (
    <div style={styles.panel}>
      <p style={styles.title}>Dados</p>
      <div style={styles.grid}>
        {DICE.map((sides) => (
          <div key={sides} style={styles.die}>
            <strong style={{ color: "#f3f4f6" }}>d{sides}</strong>
            <div style={styles.stepper}>
              <button
                style={styles.small}
                onClick={() => change(sides, -1)}
                disabled={!counts[sides]}
              >
                −
              </button>
              <span style={{ minWidth: 18, textAlign: "center" }}>
                {counts[sides] ?? 0}
              </span>
              <button style={styles.small} onClick={() => change(sides, 1)}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>

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

      <label style={styles.row}>
        Modo
        <select
          value={effectiveMode}
          onChange={(e) => setMode(e.target.value as Mode)}
          disabled={!canAdvantage}
          style={styles.input}
        >
          <option value="normal">Normal</option>
          <option value="adv">Vantagem</option>
          <option value="dis">Desvantagem</option>
        </select>
      </label>
      {effectiveMode !== "normal" && (
        <span style={styles.note}>
          {effectiveMode === "adv"
            ? "Rola 2d20 e mantém o maior."
            : "Rola 2d20 e mantém o menor."}
        </span>
      )}

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
            setCounts({});
            setRawBonus("0");
            setLabel("");
            setMode("normal");
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
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  die: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px",
    background: "#17181f",
    border: "1px solid #2e303a",
    borderRadius: 6,
  },
  stepper: { display: "flex", alignItems: "center", gap: 4 },
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