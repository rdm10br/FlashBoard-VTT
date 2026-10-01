import { spawnSync, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import * as yaml from "js-yaml";
import { bin as cloudflaredBin, install as installCloudflared } from "cloudflared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const CLIENT_INDEX = path.join(rootDir, "apps/client/dist/index.html");
const SERVER_ENTRY = path.join(rootDir, "apps/server/dist/apps/server/src/server.js");
const NAMED_TUNNEL_CONFIG = path.join(rootDir, "scripts/tunnel-config.yml");

function runBuild(label, args) {
  console.log(`\n▶ Build ausente — buildando ${label}...`);
  const result = spawnSync("npm", args, { cwd: rootDir, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`✗ Falha ao buildar ${label}. Abortando.`);
    process.exit(1);
  }
}

// --- Passo 1: recompila sempre ---
// O host serve os arquivos em dist; reutilizá-los apenas porque existem faz a
// aplicação executar uma versão antiga depois de qualquer alteração em src.
runBuild("client", ["--workspace", "apps/client", "run", "build"]);
runBuild("server", ["--workspace", "apps/server", "run", "build"]);

// --- Passo 2: garante que o binário do cloudflared está instalado ---
if (!existsSync(cloudflaredBin)) {
  console.log("\n▶ Binário do cloudflared ausente — baixando...");
  await installCloudflared(cloudflaredBin);
} else {
  console.log("✓ Binário do cloudflared já existe, pulando download.");
}

// --- Passo 3: valida o túnel nomeado (se existir), com fallback para o quick tunnel ---
function validateNamedTunnelConfig(configPath) {
  if (!existsSync(configPath)) {
    return { valid: false, reason: null }; // não configurado — silencioso, não é erro
  }

  let parsed;
  try {
    parsed = yaml.load(readFileSync(configPath, "utf-8"));
  } catch (err) {
    return { valid: false, reason: `YAML inválido: ${err.message}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, reason: "arquivo vazio ou não é um objeto YAML válido" };
  }

  if (!parsed.tunnel || typeof parsed.tunnel !== "string") {
    return { valid: false, reason: "campo 'tunnel' ausente ou inválido" };
  }

  if (!parsed["credentials-file"] || typeof parsed["credentials-file"] !== "string") {
    return { valid: false, reason: "campo 'credentials-file' ausente ou inválido" };
  }

  if (!existsSync(parsed["credentials-file"])) {
    return { valid: false, reason: `arquivo de credenciais não encontrado: ${parsed["credentials-file"]}` };
  }

  if (!Array.isArray(parsed.ingress) || parsed.ingress.length === 0) {
    return { valid: false, reason: "campo 'ingress' ausente ou vazio" };
  }

  const hasValidRoute = parsed.ingress.some(
    (rule) => rule && typeof rule.hostname === "string" && typeof rule.service === "string"
  );
  if (!hasValidRoute) {
    return { valid: false, reason: "nenhuma regra de 'ingress' com 'hostname' e 'service' válidos" };
  }

  return { valid: true, reason: null, hostname: parsed.ingress.find((r) => r.hostname)?.hostname };
}

const namedTunnel = validateNamedTunnelConfig(NAMED_TUNNEL_CONFIG);

let tunnelArgs;
if (namedTunnel.valid) {
  console.log(`✓ Túnel nomeado configurado — usando URL fixa: https://${namedTunnel.hostname}`);
  tunnelArgs = ["tunnel", "--config", NAMED_TUNNEL_CONFIG, "run"];
} else {
  if (namedTunnel.reason) {
    // Só avisa se o arquivo existe mas está incorreto — se simplesmente não existe, fica em silêncio.
    console.warn(`⚠ tunnel-config.yml encontrado mas inválido (${namedTunnel.reason}). Usando túnel temporário.`);
  }
  tunnelArgs = ["tunnel", "--url", "http://localhost:3000"];
}

// --- Passo 4: sobe o server ---
console.log("\n▶ Iniciando server...");
const server = spawn("node", [SERVER_ENTRY], { cwd: rootDir, stdio: "inherit" });

server.on("exit", (code) => {
  console.log(`Server encerrado (código ${code}).`);
  tunnel?.kill();
  process.exit(code ?? 0);
});

// --- Passo 5: sobe o túnel Cloudflare ---
console.log(namedTunnel.valid ? "▶ Iniciando túnel Cloudflare nomeado...\n" : "▶ Iniciando túnel Cloudflare temporário...\n");
const tunnel = spawn(cloudflaredBin, tunnelArgs, { cwd: rootDir });

let urlShown = false;
const urlRegex = /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/;

function handleTunnelOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);

  if (!urlShown && !namedTunnel.valid) {
    const match = text.match(urlRegex);
    if (match) {
      urlShown = true;
      console.log("\n" + "=".repeat(60));
      console.log(`  🌐 URL pública:  ${match[0]}`);
      console.log("=".repeat(60) + "\n");
    }
  }
}

tunnel.stdout.on("data", handleTunnelOutput);
tunnel.stderr.on("data", handleTunnelOutput);

tunnel.on("error", (err) => {
  console.error("\n✗ Não foi possível iniciar o cloudflared.");
  console.error(err.message);
});

tunnel.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`Túnel encerrado com código ${code}.`);
  }
});

if (namedTunnel.valid) {
  console.log("\n" + "=".repeat(60));
  console.log(`  🌐 URL pública (fixa):  https://${namedTunnel.hostname}`);
  console.log("=".repeat(60) + "\n");
}

// --- Encerramento limpo com Ctrl+C ---
process.on("SIGINT", () => {
  console.log("\n▶ Encerrando server e túnel...");
  server.kill();
  tunnel.kill();
  process.exit(0);
});
