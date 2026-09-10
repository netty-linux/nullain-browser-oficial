/**
 * Valida o catálogo de modelos (`lib/model-catalog.ts`) contra o registry
 * oficial do Mastra (`provider-registry.mjs --provider ollama-cloud`).
 *
 * Detecta drift: IDs que não existem mais no provider (viram 404 "model not
 * found" em runtime) e modelos novos disponíveis para avaliação.
 *
 * Uso: node scripts/validate-models.mjs
 * (não falha em modelos novos — só em IDs do catálogo ausentes no registry)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROVIDER = "ollama-cloud";

function readCatalogIds() {
  const source = readFileSync(join(root, "lib", "model-catalog.ts"), "utf8");
  const block = source.match(/CHAT_MODEL_IDS = \[([\s\S]*?)\]/)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function readRegistryModels() {
  const output = execFileSync(
    process.execPath,
    [
      join(root, ".agents", "skills", "mastra", "scripts", "provider-registry.mjs"),
      "--provider",
      PROVIDER,
    ],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((line) => line.match(/^  (\S+)\s*$/)?.[1])
    .filter(Boolean);
}

const catalog = readCatalogIds();
const registry = new Set(readRegistryModels());
const prefix = `${PROVIDER}/`;

let failed = false;
for (const id of catalog) {
  const name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  if (!registry.has(name)) {
    console.error(`DRIFT: catálogo usa "${id}", ausente no registry do provider "${PROVIDER}".`);
    failed = true;
  }
}

const catalogNames = new Set(
  catalog.map((id) => (id.startsWith(prefix) ? id.slice(prefix.length) : id)),
);
for (const name of [...registry].sort()) {
  if (!catalogNames.has(name))
    console.info(`NOVO no provider: ${prefix}${name} (avaliar inclusão)`);
}

if (failed) {
  console.error("\nAtualize lib/model-catalog.ts (ou os aliases em app/api/chat/route.ts).");
  process.exit(1);
}
console.info(`\nOK: ${catalog.length} modelos do catálogo conferem com o registry.`);
