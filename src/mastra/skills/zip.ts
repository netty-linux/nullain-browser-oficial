import { unzipSync } from "fflate";
import { assertSkillNameAvailable, writeUserSkillDocument } from "./loader";
import { parseAgentSkill } from "./spec";

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

/**
 * Extracts an Agent Skill package into the authenticated owner's catalog.
 * O nome vem do frontmatter do SKILL.md (dentro do zip), NÃO do nome do arquivo.
 * Aceita SKILL.md na raiz do zip ou dentro de UMA subpasta (padrão GitHub).
 *
 * Segurança:
 * - zip-slip: entries com "..", caminho absoluto ou drive letter são descartadas
 * - zip bomb: máx 200 arquivos e 5 MB descompactados
 * - destination always remains inside the owner's validated skill directory
 */
export function extractSkillZip(
  zipBuffer: Buffer,
  ownerId: string,
): {
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

  const markdown = skillEntry.data.toString("utf-8");
  const packagedDirectory = prefixLen > 0 ? skillEntry.path.split("/")[0] : undefined;
  const { frontmatter } = parseAgentSkill(markdown, packagedDirectory);
  const name = frontmatter.name;
  assertSkillNameAvailable(name, ownerId);

  const normalizedPaths = new Set<string>();
  for (const entry of collected) {
    const relativePath = stripTop(entry.path, prefixLen);
    const key = relativePath.toLowerCase();
    if (normalizedPaths.has(key)) throw new Error(`arquivo duplicado no zip: "${relativePath}"`);
    normalizedPaths.add(key);
  }

  const resources = collected
    .map((entry) => ({ path: stripTop(entry.path, prefixLen), content: entry.data }))
    .filter((entry) => entry.path !== "SKILL.md");
  const result = writeUserSkillDocument(ownerId, markdown, resources, packagedDirectory);
  return { skillName: name, files: collected.length, skillMdPath: result.path };
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

/** Se todas as entradas compartilham a MESMA primeira pasta, ela é stripada. */
function commonTopDir(paths: string[]): number {
  if (paths.some((path) => !path.includes("/"))) return 0;
  const first = paths[0]?.split("/")[0] ?? "";
  if (!first || paths.some((p) => p.split("/")[0] !== first)) return 0;
  return 1;
}

function stripTop(path: string, prefixLen: number): string {
  return prefixLen > 0 ? path.split("/").slice(prefixLen).join("/") : path;
}
