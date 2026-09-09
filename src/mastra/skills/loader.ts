import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import {
  MAX_SKILL_DESCRIPTION_LENGTH,
  createAgentSkillDocument,
  isValidAgentSkillName,
  parseAgentSkill,
  type AgentSkillFrontmatter,
} from "./spec";

export type SkillSource = "native" | "user";

export interface Skill {
  name: string;
  description: string;
  body: string;
  frontmatter: AgentSkillFrontmatter;
  sourcePath: string;
  source: SkillSource;
  /** Presentation metadata; never replaces the stable technical identifier. */
  displayName: string;
  summary: string;
}

export type SkillResource = { path: string; content: string | Buffer };
export type SkillFileEntry = { path: string; size: number };

const NATIVE_SKILLS_DIRS = [
  process.env.NULLAIN_SKILLS_DIR,
  join(process.cwd(), ".agents", "skills"),
  join(process.cwd(), "skills"),
  join(process.cwd(), "src", "mastra", "skills", "builtin"),
].filter((dir): dir is string => Boolean(dir));

let nativeCache: Skill[] | null = null;
const userCache = new Map<string, Skill[]>();

export const MAX_DESCRIPTION_LENGTH = MAX_SKILL_DESCRIPTION_LENGTH;
export const MAX_SKILL_BODY_LENGTH = 5 * 1024 * 1024;
export const MAX_SKILL_RESOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_SKILL_RESOURCES = 200;

function truncate(text: string, max = 150): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function loadSkillFromDir(dir: string, source: SkillSource): Skill | null {
  const sourcePath = join(dir, "SKILL.md");
  if (!existsSync(sourcePath)) return null;
  try {
    const directoryName = dir.split(/[\\/]/).pop() || "";
    const { frontmatter, body } = parseAgentSkill(readFileSync(sourcePath, "utf8"), directoryName);
    const presentation = frontmatter.metadata ?? {};
    return {
      name: frontmatter.name,
      description: frontmatter.description,
      body,
      frontmatter,
      sourcePath,
      source,
      displayName: presentation["nullain-display-name"] || frontmatter.name,
      summary: presentation["nullain-summary"] || truncate(frontmatter.description),
    };
  } catch {
    return null;
  }
}

function scanDirs(bases: readonly string[], source: SkillSource): Skill[] {
  const result: Skill[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const full = join(base, entry);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      const skill = loadSkillFromDir(full, source);
      if (skill && !seen.has(skill.name.toLowerCase())) {
        seen.add(skill.name.toLowerCase());
        result.push(skill);
      }
    }
  }
  return result;
}

export function skillOwnerKey(ownerId: string): string {
  if (!ownerId.trim()) throw new Error("Identidade do proprietário ausente.");
  return createHash("sha256").update(ownerId).digest("hex").slice(0, 32);
}

export function userSkillsDir(ownerId: string, create = false): string {
  const dir = join(process.cwd(), "skills", "user-scoped", skillOwnerKey(ownerId));
  if (create && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadSkills(force = false, ownerId?: string): Skill[] {
  if (!nativeCache || force) nativeCache = scanDirs(NATIVE_SKILLS_DIRS, "native");
  if (!ownerId) return [...nativeCache];
  const key = skillOwnerKey(ownerId);
  let user = userCache.get(key);
  if (!user || force) {
    user = scanDirs([userSkillsDir(ownerId)], "user");
    userCache.set(key, user);
  }
  const nativeNames = new Set(nativeCache.map((skill) => skill.name.toLowerCase()));
  return [...nativeCache, ...user.filter((skill) => !nativeNames.has(skill.name.toLowerCase()))];
}

export function getSkill(name: string, disabled: readonly string[] = [], ownerId?: string) {
  const target = name.trim().toLowerCase();
  const disabledSet = new Set(disabled.map((item) => item.toLowerCase()));
  return loadSkills(false, ownerId).find(
    (skill) => skill.name.toLowerCase() === target && !disabledSet.has(skill.name.toLowerCase()),
  );
}

export function skillRootDir(skill: Skill): string {
  return dirname(skill.sourcePath);
}

export function listSkillFiles(skill: Skill): string[] {
  const root = skillRootDir(skill);
  const out: string[] = [];
  walkDir(root, out);
  return out
    .map((path) => path.slice(root.length + 1).replace(/\\/g, "/"))
    .filter((path) => path !== "SKILL.md");
}

export function listSkillFileEntries(skill: Skill): SkillFileEntry[] {
  const root = skillRootDir(skill);
  return listSkillFiles(skill).map((path) => ({
    path,
    size: statSync(resolve(root, path)).size,
  }));
}

export function readSkillDocument(skill: Skill): string {
  return readFileSync(skill.sourcePath, "utf8");
}

export function readSkillFile(skill: Skill, relativePath: string): string | null {
  const root = resolve(skillRootDir(skill));
  const target = resolve(root, relativePath);
  if (!target.startsWith(root + sep) || !existsSync(target) || !statSync(target).isFile())
    return null;
  try {
    const realRoot = realpathSync(root);
    const realTarget = realpathSync(target);
    if (!realTarget.startsWith(realRoot + sep)) return null;
    return readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

function walkDir(directory: string, output: string[]): void {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    try {
      if (statSync(full).isDirectory()) walkDir(full, output);
      else if (output.length < 2_000) output.push(full);
    } catch {}
  }
}

export function isValidSkillName(name: string): boolean {
  return isValidAgentSkillName(name);
}

export class DuplicateSkillError extends Error {
  constructor(name: string) {
    super(`Já existe uma skill com o identificador "${name}".`);
    this.name = "DuplicateSkillError";
  }
}

export function assertSkillNameAvailable(name: string, ownerId?: string): void {
  if (loadSkills(true, ownerId).some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
    throw new DuplicateSkillError(name);
  }
}

function validateResourcePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.length > 240 ||
    normalized === "SKILL.md" ||
    !/^[a-zA-Z0-9._/-]+$/.test(normalized) ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Caminho de recurso inválido: "${path}".`);
  }
  return normalized;
}

/** Atomic and idempotent for an identical retry. It never overwrites a skill. */
export function writeUserSkill(
  ownerId: string,
  name: string,
  description: string,
  body: string,
  options: {
    displayName?: string;
    summary?: string;
    license?: string;
    compatibility?: string;
    metadata?: Record<string, string>;
    allowedTools?: string;
    resources?: SkillResource[];
  } = {},
): { path: string; created: boolean } {
  if (!body.trim()) throw new Error("Skill instructions are required.");
  const metadata = { ...options.metadata };
  if (options.displayName?.trim()) metadata["nullain-display-name"] = options.displayName.trim();
  if (options.summary?.trim()) metadata["nullain-summary"] = options.summary.trim();
  const markdown = createAgentSkillDocument(
    {
      name,
      description,
      ...(options.license ? { license: options.license } : {}),
      ...(options.compatibility ? { compatibility: options.compatibility } : {}),
      ...(Object.keys(metadata).length ? { metadata } : {}),
      ...(options.allowedTools ? { "allowed-tools": options.allowedTools } : {}),
    },
    body,
  );
  return writeUserSkillDocument(ownerId, markdown, options.resources);
}

/** Installs a complete spec-valid SKILL.md without discarding optional frontmatter. */
export function writeUserSkillDocument(
  ownerId: string,
  markdown: string,
  resources: SkillResource[] = [],
  expectedDirectoryName?: string,
): { path: string; created: boolean } {
  const parsed = parseAgentSkill(markdown, expectedDirectoryName);
  const name = parsed.frontmatter.name;
  if (parsed.body.length > MAX_SKILL_BODY_LENGTH) throw new Error("SKILL.md body is too large.");
  if (resources.length > MAX_SKILL_RESOURCES) throw new Error("Recursos demais na skill.");
  let resourceBytes = 0;
  const resourcePaths = new Set<string>();
  const normalizedResources = resources.map((resource) => {
    resourceBytes +=
      typeof resource.content === "string"
        ? Buffer.byteLength(resource.content, "utf8")
        : resource.content.byteLength;
    const path = validateResourcePath(resource.path);
    const key = path.toLowerCase();
    if (resourcePaths.has(key)) throw new Error(`Duplicate skill resource: "${path}".`);
    resourcePaths.add(key);
    return { path, content: resource.content };
  });
  if (resourceBytes > MAX_SKILL_RESOURCE_BYTES) throw new Error("Recursos da skill excedem 1 MB.");
  const base = resolve(userSkillsDir(ownerId, true));
  const directory = resolve(base, name);
  if (!directory.startsWith(base + sep)) throw new Error("Caminho de skill inválido.");

  if (existsSync(directory)) {
    const existingPath = join(directory, "SKILL.md");
    const existing = loadSkillFromDir(directory, "user");
    const existingResources = existing ? listSkillFiles(existing).sort() : [];
    const requestedResources = normalizedResources.map((resource) => resource.path).sort();
    const sameResources =
      existingResources.length === requestedResources.length &&
      existingResources.every(
        (path, index) =>
          path === requestedResources[index] &&
          readFileSync(resolve(directory, path)).equals(
            Buffer.from(
              normalizedResources.find((resource) => resource.path === path)?.content ?? "",
            ),
          ),
      );
    if (
      existsSync(existingPath) &&
      readFileSync(existingPath, "utf8") === markdown &&
      sameResources
    ) {
      return { path: existingPath, created: false };
    }
    throw new DuplicateSkillError(name);
  }
  if (loadSkills(true).some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
    throw new DuplicateSkillError(name);
  }

  const temporary = resolve(base, `.creating-${name}-${randomUUID()}`);
  try {
    mkdirSync(temporary);
    writeFileSync(join(temporary, "SKILL.md"), markdown, "utf8");
    for (const resource of normalizedResources) {
      const target = resolve(temporary, resource.path);
      if (!target.startsWith(temporary + sep)) throw new Error("Caminho de recurso inválido.");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, resource.content, "utf8");
    }
    renameSync(temporary, directory);
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
    if (existsSync(directory)) throw new DuplicateSkillError(name);
    throw error;
  }
  userCache.delete(skillOwnerKey(ownerId));
  return { path: join(directory, "SKILL.md"), created: true };
}

export function deleteUserSkill(ownerId: string, name: string): boolean {
  if (!isValidSkillName(name)) return false;
  const base = resolve(userSkillsDir(ownerId));
  const directory = resolve(base, name);
  if (!directory.startsWith(base + sep) || !existsSync(join(directory, "SKILL.md"))) return false;
  rmSync(directory, { recursive: true, force: true });
  try {
    if (readdirSync(base).length === 0) rmdirSync(base);
    const scopedRoot = dirname(base);
    if (readdirSync(scopedRoot).length === 0) rmdirSync(scopedRoot);
  } catch {}
  userCache.delete(skillOwnerKey(ownerId));
  return true;
}

export function listUserSkillNames(ownerId: string): string[] {
  return loadSkills(true, ownerId)
    .filter((skill) => skill.source === "user")
    .map((skill) => skill.name);
}

export function skillsIndexPrompt(
  disabled: readonly string[] = [],
  ownerId?: string,
  allowedNames?: readonly string[],
): string {
  const disabledSet = new Set(disabled.map((name) => name.toLowerCase()));
  const allowed = allowedNames ? new Set(allowedNames.map((name) => name.toLowerCase())) : null;
  const skills = loadSkills(false, ownerId).filter(
    (skill) =>
      !disabledSet.has(skill.name.toLowerCase()) &&
      (!allowed || allowed.has(skill.name.toLowerCase())),
  );
  if (!skills.length) return "";
  return [
    "## Available Agent Skills",
    "The following skills provide specialized instructions for specific tasks.",
    "When a task matches a skill description, call load_skill with its exact name before proceeding.",
    "<available_skills>",
    ...skills.map(
      (skill) =>
        `  <skill><name>${escapeXml(skill.name)}</name><description>${escapeXml(skill.description)}</description></skill>`,
    ),
    "</available_skills>",
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function skillContentEnvelope(skill: Skill): string {
  const files = listSkillFiles(skill);
  return [
    `<skill_content name="${escapeXml(skill.name)}">`,
    skill.body,
    "",
    "Relative resource paths are resolved from this skill's directory.",
    ...(files.length
      ? [
          "<skill_resources>",
          ...files.map((file) => `  <file>${escapeXml(file)}</file>`),
          "</skill_resources>",
        ]
      : []),
    "</skill_content>",
  ].join("\n");
}

/**
 * Server-authoritative instructions for an explicit per-message selection.
 * The state notice deliberately precedes the skill body so stale conversation
 * history (for example, the creation receipt saying "disabled by default")
 * cannot be mistaken for the current availability state.
 */
export function selectedSkillPrompt(skill: Skill): string {
  return [
    "## Explicit Agent Skill activation",
    `The server has validated '${skill.name}' for this account.`,
    "AUTHORITATIVE CURRENT STATE: ENABLED AND AVAILABLE.",
    "Apply this skill to the current request. Ignore stale conversation messages or tool results claiming it was disabled, and do not ask the user to enable it again.",
    "This explicit selection applies only to the current message and does not imply that execution succeeded.",
    "",
    skillContentEnvelope(skill),
  ].join("\n");
}
