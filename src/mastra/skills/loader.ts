import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, dirname, resolve, sep } from "node:path";

/**
 * Nullain Skills — loader de SKILL.md (formato Agent Skills open source).
 *
 * Progressive disclosure: o system prompt carrega SÓ o índice (name +
 * description, ~40 tokens/skill). O corpo completo entra no contexto apenas
 * quando o agente chama a tool load_skill(name).
 *
 * Formato de cada skill:
 *   skills/<nome>/SKILL.md com frontmatter YAML:
 *   ---
 *   name: web-research
 *   description: Deep research multi-query com citações. Use quando ...
 *   ---
 *   (corpo markdown com instruções)
 */

export interface Skill {
  name: string;
  description: string;
  body: string;
  /** path completo do SKILL.md (para debug/refresh) */
  sourcePath: string;
}

const SKILLS_DIRS = [
  process.env.NULLAIN_SKILLS_DIR,
  join(process.cwd(), "skills"),
  join(process.cwd(), "skills", "user"),
  join(process.cwd(), "src", "mastra", "skills", "builtin"),
].filter((d): d is string => Boolean(d));

/** Cache simples em memória — skills mudam raramente em runtime. */
let cache: Skill[] | null = null;

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) frontmatter[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: m[2].trim() };
}

function loadSkillFromDir(dir: string): Skill | null {
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) return null;
  try {
    const raw = readFileSync(skillMd, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const name = frontmatter.name || dir.split(/[\\/]/).pop() || "";
    if (!name || !frontmatter.description) return null;
    return {
      name,
      description: frontmatter.description,
      body,
      sourcePath: skillMd,
    };
  } catch {
    return null;
  }
}

/** Carrega todas as skills dos diretórios configurados. */
export function loadSkills(force = false): Skill[] {
  if (cache && !force) return cache;
  const skills: Skill[] = [];
  const seen = new Set<string>();
  for (const base of SKILLS_DIRS) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const full = join(base, entry);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      const skill = loadSkillFromDir(full);
      if (skill && !seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push(skill);
      }
    }
  }
  cache = skills;
  return skills;
}

/** Busca uma skill pelo nome (case-insensitive). */
export function getSkill(name: string, disabled: readonly string[] = []): Skill | undefined {
  const target = name.trim().toLowerCase();
  return loadSkills()
    .filter((s) => !disabled.includes(s.name))
    .find((s) => s.name.toLowerCase() === target);
}

// ---------------------------------------------------------------------------
// Progressive disclosure de arquivos (references/scripts/assets)
// ---------------------------------------------------------------------------
// A spec Agent Skills recomenda mover material detalhado para arquivos
// separados (references/, scripts/, assets/) e carregá-los sob demanda. O
// load_skill retorna o corpo do SKILL.md; estes helpers permitem ao agente
// listar e ler esses arquivos quando a skill instruir.

/** Diretório raiz de uma skill (onde fica o SKILL.md). */
export function skillRootDir(skill: Skill): string {
  return dirname(skill.sourcePath);
}

/** Lista os arquivos de apoio de uma skill (references/, scripts/, assets/). */
export function listSkillFiles(skill: Skill): string[] {
  const root = skillRootDir(skill);
  const out: string[] = [];
  for (const sub of ["references", "scripts", "assets"]) {
    // As skills são dados de runtime; não devem fazer o Turbopack incluir o
    // projeto inteiro no bundle por causa deste caminho dinâmico.
    const dir = join(/* turbopackIgnore: true */ root, sub);
    if (!existsSync(/* turbopackIgnore: true */ dir)) continue;
    walkDir(dir, out);
  }
  return out.map((p) => p.slice(root.length + 1).replace(/\\/g, "/"));
}

/** Lê o conteúdo de um arquivo de apoio da skill (path relativo à raiz). */
export function readSkillFile(skill: Skill, relPath: string): string | null {
  const root = skillRootDir(skill);
  const target = resolve(root, relPath);
  // Guarda anti-traversal: o arquivo precisa estar dentro da raiz da skill
  if (!target.startsWith(root + sep)) return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  try {
    return readFileSync(target, "utf-8");
  } catch {
    return null;
  }
}

function walkDir(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) walkDir(full, acc);
      else acc.push(full);
    } catch {
      // ignora entries ilegíveis
    }
  }
}

// ---------------------------------------------------------------------------
// User skills — criação/remoção em runtime por ação explícita na UI
// ---------------------------------------------------------------------------

/**
 * Nome válido de skill — segue a spec Agent Skills:
 * - 1-64 caracteres
 * - apenas a-z, 0-9 e hífen
 * - não começa nem termina com hífen
 * - sem hífens consecutivos
 * (mata path traversal por construção)
 */
export function isValidSkillName(name: string): boolean {
  if (typeof name !== "string" || name.length < 1 || name.length > 64) return false;
  // a-z, 0-9 e hífens simples entre grupos alfanuméricos — sem hífen no
  // início/fim e sem hífens consecutivos (spec Agent Skills)
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

/** Limite da description conforme a spec Agent Skills (máx 1024 chars). */
export const MAX_DESCRIPTION_LENGTH = 1024;

/** Diretório base das skills criadas pelo usuário (sempre dentro do projeto). */
export function userSkillsDir(): string {
  const dir = join(process.cwd(), "skills", "user");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Escreve (cria ou substitui) uma skill de usuário.
 * Retorna o caminho do SKILL.md gravado. Invalida o cache do loader.
 */
export function writeUserSkill(name: string, description: string, body: string): string {
  if (!isValidSkillName(name)) {
    throw new Error(`Nome de skill inválido: "${name}" (use kebab-case: a-z, 0-9, hífen)`);
  }
  if (!description.trim()) throw new Error("description é obrigatória");
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`description muito longa (máx ${MAX_DESCRIPTION_LENGTH} chars)`);
  }
  if (!body.trim()) throw new Error("body é obrigatório");
  if (body.length > 200_000) throw new Error("corpo da skill muito grande (máx 200k chars)");

  const base = userSkillsDir();
  const dir = join(base, name);
  // Guarda anti-traversal: o nome validado não contém / nem .., mas garante
  const resolved = join(dir, "SKILL.md");
  if (!resolved.startsWith(base)) {
    throw new Error("Caminho de skill inválido");
  }
  mkdirSync(dir, { recursive: true });
  const md = `---\nname: ${name}\ndescription: ${description.replace(/\r?\n/g, " ")}\n---\n\n${body}\n`;
  writeFileSync(join(dir, "SKILL.md"), md, "utf-8");
  loadSkills(true); // invalida cache
  return join(dir, "SKILL.md");
}

/** Remove uma skill de usuário. Skills builtin não podem ser removidas aqui. */
export function deleteUserSkill(name: string): boolean {
  if (!isValidSkillName(name)) return false;
  const base = userSkillsDir();
  const dir = join(base, name);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  loadSkills(true);
  return true;
}

/** Lista skills criadas pelo usuário (não builtin). */
export function listUserSkillNames(): string[] {
  const base = userSkillsDir();
  try {
    return readdirSync(base).filter((e) => statSync(join(base, e)).isDirectory());
  } catch {
    return [];
  }
}

/** Índice leve para o system prompt (~40 tokens por skill). */
export function skillsIndexPrompt(disabled: readonly string[] = []): string {
  const skills = loadSkills().filter((s) => !disabled.includes(s.name));
  if (!skills.length) return "";
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return [
    "",
    "## Skills disponíveis",
    "Você possui skills (procedimentos especializados). Se a pergunta do usuário casar com uma delas, chame a tool load_skill com o nome correto ANTES de responder, e siga as instruções da skill.",
    ...lines,
  ].join("\n");
}
