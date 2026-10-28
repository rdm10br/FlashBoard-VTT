import { existsSync } from "node:fs";
import path from "node:path";

// Variáveis já definidas no ambiente têm prioridade sobre o arquivo.
for (const file of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}