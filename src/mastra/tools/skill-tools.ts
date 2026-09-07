import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSkill, loadSkills, listSkillFiles, readSkillFile } from "../skills/loader";
import type { Skill } from "../skills/loader";

/**
 * Tool load_skill — progressive disclosure das skills.
 * O agente vê só o índice no system prompt; quando julga relevante, chama esta
 * tool para receber o corpo completo da skill (instruções detalhadas) e a segue.
 * Também lista os arquivos de apoio (references/scripts/assets) para que o
 * agente possa ler material detalhado sob demanda via read_skill_file.
 */
function createLoadSkillTool(disabledSkills: readonly string[]) {
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
      const skill = getSkill(input.name, disabledSkills);
      if (skill) {
        return {
          found: true,
          name: skill.name,
          instructions: skill.body,
          files: listSkillFiles(skill),
        };
      }
      return {
        found: false,
        name: input.name,
        instructions: `Skill "${input.name}" não encontrada.`,
        available: loadSkills()
          .filter((s: Skill) => !disabledSkills.includes(s.name))
          .map((s: Skill) => s.name),
      };
    },
  });
}

/**
 * Tool read_skill_file — lê um arquivo de apoio (references/scripts/assets)
 * de uma skill carregada. Progressive disclosure de recursos: o agente só
 * carrega o arquivo quando a skill instruir (ex.: "leia references/api.md
 * se a API retornar erro").
 */
function createReadSkillFileTool(disabledSkills: readonly string[]) {
  return createTool({
    id: "read_skill_file",
    description:
      "Read a bundled support file (references/, scripts/, assets/) of a skill you have already loaded with load_skill. Use this when the skill's instructions tell you to consult a specific file on demand. Pass the file path exactly as listed in the load_skill result.",
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
      const skill = getSkill(input.skill, disabledSkills);
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

/** Constrói tools isoladas para uma única requisição. */
export function createSkillsToolset(disabledSkills: readonly string[] = []) {
  const disabled = [...new Set(disabledSkills)];
  return {
    skills: {
      load_skill: createLoadSkillTool(disabled),
      read_skill_file: createReadSkillFileTool(disabled),
    },
  } as const;
}
