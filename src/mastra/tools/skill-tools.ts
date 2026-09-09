import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  DuplicateSkillError,
  getSkill,
  loadSkills,
  listSkillFiles,
  readSkillFile,
  skillContentEnvelope,
  writeUserSkill,
} from "../skills/loader";
import type { Skill } from "../skills/loader";

/**
 * Tool load_skill — progressive disclosure das skills.
 * O agente vê só o índice no system prompt; quando julga relevante, chama esta
 * tool para receber o corpo completo da skill (instruções detalhadas) e a segue.
 * Também lista os arquivos de apoio para que o
 * agente possa ler material detalhado sob demanda via read_skill_file.
 */
function createLoadSkillTool(
  disabledSkills: readonly string[],
  ownerId?: string,
  allowedNames?: readonly string[],
) {
  return createTool({
    id: "load_skill",
    description:
      "Load the full instructions of a Nullain skill (a specialized procedure). Call this when the user's request matches one of the skills listed in your instructions, then follow the returned instructions to complete the task. The result also lists any reference/script/asset files the skill bundles, which you can read on demand with read_skill_file.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe(
          "The skill name exactly as listed in the 'Skills disponíveis' section (e.g. 'web-research').",
        ),
    }),
    outputSchema: z.object({
      found: z.boolean(),
      name: z.string(),
      instructions: z.string(),
      files: z.array(z.string()).optional(),
      available: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      const candidate = getSkill(input.name, disabledSkills, ownerId);
      const allowed = allowedNames ? new Set(allowedNames.map((name) => name.toLowerCase())) : null;
      const skill =
        candidate && (!allowed || allowed.has(candidate.name.toLowerCase()))
          ? candidate
          : undefined;
      if (skill) {
        return {
          found: true,
          name: skill.name,
          instructions: skillContentEnvelope(skill),
          files: listSkillFiles(skill),
        };
      }
      return {
        found: false,
        name: input.name,
        instructions: `Skill "${input.name}" não encontrada.`,
        available: loadSkills(false, ownerId)
          .filter(
            (s: Skill) =>
              !disabledSkills.some((name) => name.toLowerCase() === s.name.toLowerCase()),
          )
          .map((s: Skill) => s.name),
      };
    },
  });
}

/**
 * Tool read_skill_file — lê um arquivo de apoio da skill
 * de uma skill carregada. Progressive disclosure de recursos: o agente só
 * carrega o arquivo quando a skill instruir (ex.: "leia references/api.md
 * se a API retornar erro").
 */
function createReadSkillFileTool(
  disabledSkills: readonly string[],
  ownerId?: string,
  allowedNames?: readonly string[],
) {
  return createTool({
    id: "read_skill_file",
    description:
      "Read a bundled support file of a skill you have already loaded with load_skill. Use this when the skill's instructions tell you to consult a specific file on demand. Pass the file path exactly as listed in the load_skill result.",
    inputSchema: z.object({
      skill: z.string().min(1).describe("The skill name (must be loaded first via load_skill)."),
      file: z
        .string()
        .min(1)
        .describe(
          "Relative path of the file inside the skill, e.g. 'references/api-errors.md' or 'scripts/process.py'.",
        ),
    }),
    outputSchema: z.object({
      found: z.boolean(),
      skill: z.string(),
      file: z.string(),
      content: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async (input) => {
      const candidate = getSkill(input.skill, disabledSkills, ownerId);
      const allowed = allowedNames ? new Set(allowedNames.map((name) => name.toLowerCase())) : null;
      const skill =
        candidate && (!allowed || allowed.has(candidate.name.toLowerCase()))
          ? candidate
          : undefined;
      if (!skill) {
        return {
          found: false,
          skill: input.skill,
          file: input.file,
          error: `Skill "${input.skill}" não encontrada. Carregue-a com load_skill primeiro.`,
        };
      }
      const content = readSkillFile(skill, input.file);
      if (content === null) {
        return {
          found: false,
          skill: input.skill,
          file: input.file,
          error: `Arquivo "${input.file}" não encontrado na skill. Arquivos disponíveis: ${listSkillFiles(skill).join(", ") || "(nenhum)"}`,
        };
      }
      return { found: true, skill: input.skill, file: input.file, content };
    },
  });
}

function createSkillCreatorTool(ownerId: string) {
  return createTool({
    id: "create_skill",
    description:
      "Create and register one specification-compliant Agent Skill in the authenticated user's private catalog. Only call after the user explicitly requested skill creation and the official Agent Skills documentation has been consulted when relevant. Never overwrite an identifier or execute bundled scripts.",
    inputSchema: z.object({
      name: z.string().min(1).max(64).describe("Stable kebab-case technical identifier."),
      description: z
        .string()
        .min(1)
        .max(1024)
        .describe("English description of what it handles and when to use it."),
      instructions: z
        .string()
        .min(1)
        .max(200_000)
        .describe(
          "Reusable SKILL.md body, written in English unless explicitly requested otherwise.",
        ),
      displayName: z.string().min(1).max(100).optional(),
      summary: z.string().min(1).max(240).optional(),
      license: z.string().min(1).optional(),
      compatibility: z.string().min(1).max(500).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
      allowedTools: z
        .string()
        .min(1)
        .describe("Space-separated pre-approved tools (experimental).")
        .optional(),
      resources: z
        .array(
          z.object({
            path: z
              .string()
              .min(1)
              .max(240)
              .describe(
                "Relative package path under references/, scripts/, templates/, or assets/.",
              ),
            content: z.string().max(1_000_000),
          }),
        )
        .max(32)
        .optional(),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      name: z.string(),
      created: z.boolean().optional(),
      enabled: z.boolean().optional(),
      location: z.string().optional(),
      error: z.string().optional(),
      conflict: z.boolean().optional(),
    }),
    execute: async (input) => {
      try {
        const result = writeUserSkill(ownerId, input.name, input.description, input.instructions, {
          displayName: input.displayName,
          summary: input.summary,
          license: input.license,
          compatibility: input.compatibility,
          metadata: input.metadata,
          allowedTools: input.allowedTools,
          resources: input.resources,
        });
        return {
          ok: true,
          name: input.name,
          created: result.created,
          enabled: false,
          location: `Catálogo privado /skills/${input.name}`,
        };
      } catch (error) {
        return {
          ok: false,
          name: input.name,
          error: error instanceof Error ? error.message : "Não foi possível criar a skill.",
          conflict: error instanceof DuplicateSkillError,
        };
      }
    },
  });
}

/** Constrói tools isoladas para uma única requisição. */
export function createSkillsToolset(
  disabledSkills: readonly string[] = [],
  options: { ownerId?: string; allowCreate?: boolean; allowedSkillNames?: readonly string[] } = {},
) {
  const disabled = [...new Set(disabledSkills)];
  return {
    skills: {
      load_skill: createLoadSkillTool(disabled, options.ownerId, options.allowedSkillNames),
      read_skill_file: createReadSkillFileTool(
        disabled,
        options.ownerId,
        options.allowedSkillNames,
      ),
      ...(options.ownerId && options.allowCreate
        ? { create_skill: createSkillCreatorTool(options.ownerId) }
        : {}),
    },
  } as const;
}
