import { useEffect, useState } from "react";
import type { AdminUserSummary } from "@vtt/protocol";

type AdminPanelProps = {
  users: AdminUserSummary[];
  error?: string | null;
  onRefresh: () => void;
  onSetCredentials: (userId: string, email: string, password: string) => void;
};

export function AdminPanel({ users, error, onRefresh, onSetCredentials }: AdminPanelProps) {
  const [selectedId, setSelectedId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const selectedUser = users.find((user) => user.id === selectedId) ?? users[0];

  useEffect(() => {
    if (!selectedUser) {
      setSelectedId("");
      setEmail("");
      return;
    }
    setSelectedId(selectedUser.id);
    setEmail(selectedUser.email ?? "");
  }, [selectedUser?.id, selectedUser?.email]);

  function submit() {
    if (!selectedUser) return;
    if (!email.trim() || password.length < 12) return;
    onSetCredentials(selectedUser.id, email.trim(), password);
    setPassword("");
  }

  return (
    <section style={styles.section}>
      <div style={styles.heading}>
        <div>
          <h2 style={styles.title}>Administração de contas</h2>
          <p style={styles.note}>Associe contas antigas ou redefina credenciais após verificar a identidade da pessoa por um canal confiável.</p>
        </div>
        <button style={styles.button} onClick={onRefresh}>Atualizar lista</button>
      </div>

      <label style={styles.field}>
        <span>Conta</span>
        <select style={styles.input} value={selectedUser?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.nickname} — {user.is_legacy ? "conta antiga sem credenciais" : user.email}
            </option>
          ))}
        </select>
      </label>

      {selectedUser && (
        <>
          <label style={styles.field}>
            <span>E-mail da conta</span>
            <input style={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label style={styles.field}>
            <span>Nova senha (mínimo 12 caracteres)</span>
            <input style={styles.input} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button style={styles.button} onClick={submit} disabled={!email.trim() || password.length < 12}>
            Associar ou redefinir credenciais
          </button>
          <p style={styles.note}>A alteração encerra as sessões ativas dessa conta. Informe a senha nova diretamente à pessoa por um canal seguro.</p>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: "16px",
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  heading: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" },
  title: { margin: 0, color: "#f3f4f6", fontSize: "15px" },
  note: { margin: "6px 0 0", color: "#9ca3af", fontSize: "12px", lineHeight: 1.5 },
  field: { display: "flex", flexDirection: "column", gap: "6px", color: "#9ca3af", fontSize: "13px" },
  input: {
    padding: "9px 10px",
    background: "#0f1115",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#f3f4f6",
    fontSize: "14px",
  },
  button: {
    alignSelf: "flex-start",
    padding: "8px 12px",
    background: "#aa3bff",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    cursor: "pointer",
  },
  error: { margin: 0, color: "#f87171", fontSize: "13px" },
};
