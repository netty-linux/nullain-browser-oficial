import "server-only";

import { createSkill, type AgentSkillsResolver } from "@mastra/core/skills";
import { listSkillFiles, loadSkills, readSkillFile, type Skill } from "./loader";

/**
 * ============================================================================
 * Resolver dinâmico de skills NATIVO do Mastra (`Agent.skills`).
 *
 * Substitui o antigo sistema hand-rolled (`load_skill`/`read_skill_file` +
 * índice em prompt): o Mastra injeta automaticamente as tools `skill`,
 * `skill_read` e `skill_search` (progressive disclosure nativo), e este
 * resolver decide POR REQUEST quais skills existem, lendo os mesmos filtros
 * que a rota valida (dono, desativadas, grants do bot, seleção explícita)
 * via RequestContext.
 *
 * Descoberta/validação em disco continua no `loader.ts` (fonte única de
 * verdade do catálogo); aqui só acontece filtragem + adaptação para o
 * formato nativo (`createSkill` inline).
 * ============================================================================
 */

/** Chaves cruas lidas/escritas no RequestContext (ver route.ts). */
export const SKILL_CONTEXT_KEYS = {
  ownerId: "nullain.ownerId",
  disabledSkills: "nullain.disabledSkills",
  grantedSkills: "nullain.grantedSkills",
  selectedSkill: "nullain.selectedSkill",
} as const;

const MAX_INLINE_INSTRUCTIONS = 32_000;
const MAX_REFERENCE_FILE_BYTES = 50_000;
const MAX_TOTAL_REFERENCE_BYTES = 200_000;

/** Extensões nunca embutidas em `references` (binários). */
const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ico",
  "bmp",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "zip",
  "db",
  "sqlite",
  "pdf",
]);

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Monta `references` (arquivos de apoio em memória p/ `skill_read`). */
function buildReferences(skill: Skill): Record<string, string> {
  const references: Record<string, string> = {};
  let used = 0;
  for (const file of listSkillFiles(skill)) {
    if (used >= MAX_TOTAL_REFERENCE_BYTES) break;
    const extension = file.split(".").pop()?.toLowerCase() ?? "";
    if (BINARY_EXTENSIONS.has(extension)) continue;
    const content = readSkillFile(skill, file);
    if (!content || Buffer.byteLength(content, "utf8") > MAX_REFERENCE_FILE_BYTES) continue;
    references[file] = content;
    used += Buffer.byteLength(content, "utf8");
  }
  return references;
}

function toNativeSkill(skill: Skill) {
  return createSkill({
    name: skill.name,
    description: truncate(skill.description, 1024),
    instructions:
      skill.body.length > MAX_INLINE_INSTRUCTIONS
        ? `${skill.body.slice(0, MAX_INLINE_INSTRUCTIONS)}\n\n[Instruções truncadas para o contexto. Leia arquivos específicos via skill_read.]`
        : skill.body,
    references: buildReferences(skill),
  });
}

/**
 * Resolver executado uma vez por RequestContext (também em leituras de
 * metadata como `listSkills()`, onde o contexto vem vazio — por isso todos
 * os filtros degradam para defaults seguros e rápidos).
 */
export const resolveNullainSkills: AgentSkillsResolver = ({ requestContext }) => {
  const getRaw = (key: string): unknown =>
    (requestContext as { getRaw?: (k: string) => unknown })?.getRaw?.(key);
  const ownerId = toOptionalString(getRaw(SKILL_CONTEXT_KEYS.ownerId));
  const disabled = new Set(
    toStringArray(getRaw(SKILL_CONTEXT_KEYS.disabledSkills)).map((n) => n.toLowerCase()),
  );
  const grantedRaw = toStringArray(getRaw(SKILL_CONTEXT_KEYS.grantedSkills));
  const granted = grantedRaw.length > 0 ? new Set(grantedRaw.map((n) => n.toLowerCase())) : null;

  const skills = loadSkills(false, ownerId).filter(
    (skill) =>
      !disabled.has(skill.name.toLowerCase()) &&
      (!granted || granted.has(skill.name.toLowerCase())),
  );
  // Uma skill com frontmatter fora do formato nativo (ex.: nome inválido)
  // nunca pode quebrar o chat: pula com aviso em vez de lançar.
  const native = [];
  for (const skill of skills) {
    try {
      native.push(toNativeSkill(skill));
    } catch (error) {
      console.warn(
        `[native-resolver] skill "${skill.name}" ignorada:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return native;
};
