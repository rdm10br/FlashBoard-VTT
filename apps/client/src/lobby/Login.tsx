import { useState } from "react";

type LoginProps = {
  onLogin: (identifier: string, password: string) => void;
  onRegister: (email: string, nickname: string, password: string, bootstrapToken?: string) => void;
  bootstrapAvailable: boolean;
  error?: string | null;
};

export function Login({ onLogin, onRegister, bootstrapAvailable, error }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit() {
    setLocalError(null);
    if (mode === "login") {
      if (!identifier.trim() || !password) {
        setLocalError("Informe e-mail ou apelido e senha.");
        return;
      }
      onLogin(identifier.trim(), password);
      return;
    }

    if (!email.trim() || !nickname.trim() || !password) {
      setLocalError("Preencha e-mail, apelido e senha.");
      return;
    }
    if (password.length < 12) {
      setLocalError("A senha deve ter pelo menos 12 caracteres.");
      return;
    }
    onRegister(email.trim(), nickname.trim(), password, bootstrapToken || undefined);
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setLocalError(null);
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚔️ VTT</h1>
        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(mode === "login" ? styles.activeTab : {}) }} onClick={() => switchMode("login")}>
            Entrar
          </button>
          <button style={{ ...styles.tab, ...(mode === "register" ? styles.activeTab : {}) }} onClick={() => switchMode("register")}>
            Criar conta
          </button>
        </div>

        {mode === "login" ? (
          <>
            <label style={styles.field}>
              <span>E-mail ou apelido</span>
              <input
                style={styles.input}
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </label>
            <label style={styles.field}>
              <span>Senha</span>
              <input
                style={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
              />
            </label>
          </>
        ) : (
          <>
            <label style={styles.field}>
              <span>E-mail</span>
              <input style={styles.input} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label style={styles.field}>
              <span>Apelido</span>
              <input style={styles.input} autoComplete="username" maxLength={32} value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </label>
            <label style={styles.field}>
              <span>Senha (mínimo 12 caracteres)</span>
              <input
                style={styles.input}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
              />
            </label>
            {bootstrapAvailable && (
              <label style={styles.field}>
                <span>Código de criação do primeiro administrador</span>
                <input
                  style={styles.input}
                  type="password"
                  autoComplete="off"
                  value={bootstrapToken}
                  onChange={(event) => setBootstrapToken(event.target.value)}
                />
              </label>
            )}
            <p style={styles.note}>
              Contas antigas não podem ser acessadas apenas pelo apelido. Peça a um administrador para associá-las com segurança.
            </p>
          </>
        )}

        {(localError || error) && <p style={styles.error}>{localError || error}</p>}
        <button style={styles.btn} onClick={handleSubmit}>
          {mode === "login" ? "Entrar" : "Criar conta"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#16171d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1f2028",
    border: "1px solid #2e303a",
    borderRadius: "12px",
    padding: "32px",
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  title: {
    margin: 0,
    color: "#f3f4f6",
    fontSize: "28px",
    fontWeight: 600,
    textAlign: "center",
  },
  tabs: { display: "flex", gap: "8px" },
  tab: {
    flex: 1,
    padding: "8px",
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#9ca3af",
    cursor: "pointer",
  },
  activeTab: { borderColor: "#aa3bff", color: "#f3f4f6" },
  field: { display: "flex", flexDirection: "column", gap: "6px", color: "#9ca3af", fontSize: "13px" },
  input: {
    padding: "10px 12px",
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#f3f4f6",
    fontSize: "15px",
    outline: "none",
  },
  error: { margin: 0, color: "#f87171", fontSize: "13px" },
  note: { margin: 0, color: "#9ca3af", fontSize: "12px", lineHeight: 1.5 },
  btn: {
    padding: "12px",
    background: "#aa3bff",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
};
