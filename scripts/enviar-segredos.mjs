// Envia às Edge Functions só os segredos delas. O .env também tem a chave secreta e a do Firebase, que não devem ir para lá.
// Uso: npm run segredos
import { spawnSync } from "node:child_process";

const SEGREDOS_DAS_FUNCOES = ["ASANA_TOKEN", "BACKUP_CRON_SEGREDO"];

const faltando = SEGREDOS_DAS_FUNCOES.filter((nome) => !process.env[nome]);
if (faltando.length) {
  console.error(`Preencha no .env: ${faltando.join(", ")}`);
  process.exit(1);
}

const pares = SEGREDOS_DAS_FUNCOES.map((nome) => `${nome}=${process.env[nome]}`);
const resultado = spawnSync("npx", ["supabase", "secrets", "set", ...pares], { stdio: "inherit", shell: true });
process.exit(resultado.status ?? 1);
