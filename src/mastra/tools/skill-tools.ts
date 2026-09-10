import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { DuplicateSkillError, writeUserSkill } from "../skills/loader";

/**
 * create_skill — ÚNICA tool custom de skills restante.
 *
 * Leitura/descoberta de skills é NATIVA do Mastra (Agent.skills com resolver
 * dinâmico em skills/native-resolver.ts; tools `skill`/`skill_read`/
 * `skill_search` injetadas automaticamente). Aqui vive só a CRIAÇÃO,
 * ainda gated por pedido explícito do usuário (ver route.ts).
 */
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

/** Constrói o toolset de criação de skills para uma única requisição. */
export function createSkillCreatorToolset(
  options: { ownerId?: string; allowCreate?: boolean } = {},
) {
  const skills: Record<string, unknown> = {};
  if (options.ownerId && options.allowCreate) {
    skills.create_skill = createSkillCreatorTool(options.ownerId);
  }
  return { skills } as const;
}
