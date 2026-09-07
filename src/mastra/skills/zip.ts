import { unzipSync } from "fflate";
import { join, resolve, sep } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { isValidSkillName, userSkillsDir, loadSkills, MAX_DESCRIPTION_LENGTH } from "./loader";

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

/**
 * Extrai um zip de skill para skills/user/<name>/.
 * O nome vem do frontmatter do SKILL.md (dentro do zip), NÃO do nome do arquivo.
 * Aceita SKILL.md na raiz do zip ou dentro de UMA subpasta (padrão GitHub).
 *
 * Segurança:
 * - zip-slip: entries com "..", caminho absoluto ou drive letter são descartadas
 * - zip bomb: máx 200 arquivos e 5 MB descompactados
 * - destino sempre dentro de skills/user/<nome-validado>/
 */
export function extractSkillZip(zipBuffer: Buffer): {
  skillName: string;
  files: number;
  skillMdPath: string;
} {
  let unzipped: Record<string, Uint8Array>;
  let filesSeen = 0;
  let declaredBytes = 0;
  try {
    unzipped = unzipSync(new Uint8Array(zipBuffer), {
      filter: (entry) => {
        const path = entry.name.replace(/\\/g, "/");
        if (!isSafeZipPath(path)) throw new Error(`caminho inseguro no zip: "${entry.name}"`);
        if (path.endsWith("/")) return false;
        filesSeen += 1;
        declaredBytes += entry.originalSize;
        if (filesSeen > MAX_FILES) throw new Error(`zip excede o limite de ${MAX_FILES} arquivos`);
        if (declaredBytes > MAX_TOTAL_BYTES) {
          throw new Error("zip descompactado acima de 5 MB — recusado");
        }
        return true;
      },
    });
  } catch (e) {
    throw new Error(`zip inválido: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Filtra diretórios e entries perigosas (zip-slip)
  const collected: Array<{ path: string; data: Buffer }> = [];
  for (const [rawPath, data] of Object.entries(unzipped)) {
    const p = rawPath.replace(/\\/g, "/");
    if (p.endsWith("/")) continue;
    collected.push({ path: p, data: Buffer.from(data) });
  }
  if (collected.length === 0) {
    throw new Error("zip vazio ou todas as entradas foram rejeitadas");
  }

  // Zip bomb: tamanho total descompactado
  let totalBytes = 0;
  for (const e of collected) totalBytes += e.data.length;
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error("zip descompactado acima de 5 MB — recusado");
  }

  // Localiza o SKILL.md, stripando subpasta única se houver (padrão GitHub)
  const prefixLen = commonTopDir(collected.map((e) => e.path));
  const skillEntry = collected.find((e) => stripTop(e.path, prefixLen) === "SKILL.md");
  if (!skillEntry) {
    throw new Error("O zip não contém um SKILL.md na raiz (ou em uma única subpasta)");
  }

  const { name, description } = parseFrontmatter(skillEntry.data.toString("utf-8"));
  if (!isValidSkillName(name)) {
    throw new Error(`Frontmatter 'name' inválido: "${name}" (use kebab-case: a-z, 0-9, hífen)`);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Frontmatter 'description' muito longa (máx ${MAX_DESCRIPTION_LENGTH} chars)`);
  }

  const normalizedPaths = new Set<string>();
  for (const entry of collected) {
    const relativePath = stripTop(entry.path, prefixLen);
    if (relativePath !== "SKILL.md" && !/^(?:references|scripts|assets)\//.test(relativePath)) {
      throw new Error(`arquivo fora das pastas permitidas: "${relativePath}"`);
    }
    const key = relativePath.toLowerCase();
    if (normalizedPaths.has(key)) throw new Error(`arquivo duplicado no zip: "${relativePath}"`);
    normalizedPaths.add(key);
  }

  const base = resolve(userSkillsDir());
  const dest = resolve(base, name);
  if (!dest.startsWith(base + sep)) throw new Error("Caminho de destino inválido");

  // Recria o diretório (replace de skill existente com o mesmo nome)
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  for (const e of collected) {
    const rel = stripTop(e.path, prefixLen);
    if (rel === "SKILL.md") continue; // reescrito normalizado abaixo
    const target = resolve(dest, rel);
    if (!target.startsWith(dest + sep)) continue; // zip-slip guard final
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, e.data);
  }

  // SKILL.md normalizado: frontmatter name = nome do diretório (consistência)
  const body = skillEntry.data
    .toString("utf-8")
    .replace(/^---[\s\S]*?---\r?\n?/, "")
    .trim();
  const normalizedMd = `---\nname: ${name}\ndescription: ${description.replace(/\r?\n/g, " ")}\n---\n\n${body}\n`;
  writeFileSync(join(dest, "SKILL.md"), normalizedMd, "utf-8");

  loadSkills(true); // invalida cache do loader
  return { skillName: name, files: collected.length, skillMdPath: join(dest, "SKILL.md") };
}

function isSafeZipPath(path: string): boolean {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  const hasInvalidWindowsCharacter = [...normalized].some(
    (character) => character.charCodeAt(0) <= 31 || '<>:"|?*'.includes(character),
  );
  return (
    normalized.length > 0 &&
    normalized.length <= 512 &&
    !normalized.startsWith("/") &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !hasInvalidWindowsCharacter &&
    !normalized.split("/").some((segment) => segment === ".." || segment === "")
  );
}

/** Frontmatter mínimo sem dependência (name/description). */
function parseFrontmatter(raw: string): { name: string; description: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("SKILL.md sem frontmatter YAML (--- name/description ---)");
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!fm.name || !fm.description) {
    throw new Error("SKILL.md precisa de frontmatter com 'name' e 'description'");
  }
  return { name: fm.name, description: fm.description };
}

/** Se todas as entradas compartilham a MESMA primeira pasta, ela é stripada. */
function commonTopDir(paths: string[]): number {
  const first = paths[0]?.split("/")[0] ?? "";
  if (!first || paths.some((p) => p.split("/")[0] !== first)) return 0;
  return 1;
}

function stripTop(path: string, prefixLen: number): string {
  return prefixLen > 0 ? path.split("/").slice(prefixLen).join("/") : path;
}
