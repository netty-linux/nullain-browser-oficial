import { parseDocument, stringify } from "yaml";

export const AGENT_SKILL_FRONTMATTER_KEYS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
] as const;

export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_COMPATIBILITY_LENGTH = 500;

export type AgentSkillFrontmatter = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
};

export type ParsedAgentSkill = {
  frontmatter: AgentSkillFrontmatter;
  body: string;
};

export class AgentSkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSkillValidationError";
  }
}

export function isValidAgentSkillName(name: string): boolean {
  const normalized = name.normalize("NFKC");
  return (
    normalized.length >= 1 &&
    normalized.length <= MAX_SKILL_NAME_LENGTH &&
    normalized === normalized.toLowerCase() &&
    !normalized.startsWith("-") &&
    !normalized.endsWith("-") &&
    !normalized.includes("--") &&
    /^[\p{L}\p{N}-]+$/u.test(normalized)
  );
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentSkillValidationError(`Frontmatter '${key}' must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maximum?: number,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentSkillValidationError(`Frontmatter '${key}' must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (maximum && trimmed.length > maximum) {
    throw new AgentSkillValidationError(`Frontmatter '${key}' exceeds ${maximum} characters.`);
  }
  return trimmed;
}

function parseMetadata(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentSkillValidationError("Frontmatter 'metadata' must be a string-to-string map.");
  }
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new AgentSkillValidationError("Every frontmatter 'metadata' value must be a string.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Strict parser for the open Agent Skills SKILL.md specification. */
export function parseAgentSkill(raw: string, expectedDirectoryName?: string): ParsedAgentSkill {
  const match = raw
    .replace(/^\uFEFF/, "")
    .match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    throw new AgentSkillValidationError(
      "SKILL.md must start with YAML frontmatter delimited by '---'.",
    );
  }

  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length) {
    throw new AgentSkillValidationError(`Invalid YAML frontmatter: ${document.errors[0].message}`);
  }
  const value = document.toJS() as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentSkillValidationError("SKILL.md frontmatter must be a YAML mapping.");
  }
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set<string>(AGENT_SKILL_FRONTMATTER_KEYS);
  const unsupported = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unsupported.length) {
    throw new AgentSkillValidationError(
      `Unsupported Agent Skills frontmatter field: '${unsupported[0]}'. Put client-specific values under metadata.`,
    );
  }

  const name = requiredString(record, "name");
  if (!isValidAgentSkillName(name)) {
    throw new AgentSkillValidationError(
      "Frontmatter 'name' must contain 1-64 lowercase Unicode letters, numbers, or single hyphens, without a leading or trailing hyphen.",
    );
  }
  if (expectedDirectoryName && name.normalize("NFKC") !== expectedDirectoryName.normalize("NFKC")) {
    throw new AgentSkillValidationError(
      `Frontmatter name '${name}' must match its parent directory '${expectedDirectoryName}'.`,
    );
  }

  const description = requiredString(record, "description");
  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    throw new AgentSkillValidationError(
      `Frontmatter 'description' exceeds ${MAX_SKILL_DESCRIPTION_LENGTH} characters.`,
    );
  }

  return {
    frontmatter: {
      name,
      description,
      ...(optionalString(record, "license") ? { license: optionalString(record, "license") } : {}),
      ...(optionalString(record, "compatibility", MAX_SKILL_COMPATIBILITY_LENGTH)
        ? { compatibility: optionalString(record, "compatibility", MAX_SKILL_COMPATIBILITY_LENGTH) }
        : {}),
      ...(parseMetadata(record.metadata) ? { metadata: parseMetadata(record.metadata) } : {}),
      ...(optionalString(record, "allowed-tools")
        ? { "allowed-tools": optionalString(record, "allowed-tools") }
        : {}),
    },
    body: match[2].trim(),
  };
}

export function createAgentSkillDocument(frontmatter: AgentSkillFrontmatter, body: string): string {
  const parsed = parseAgentSkill(
    `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body.trim()}\n`,
  );
  return `---\n${stringify(parsed.frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${parsed.body}\n`;
}
