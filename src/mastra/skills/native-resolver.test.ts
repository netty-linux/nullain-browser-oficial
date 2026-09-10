import { describe, expect, it } from "vitest";
import { SKILL_CONTEXT_KEYS, resolveNullainSkills } from "./native-resolver";

function contextWith(values: Record<string, unknown> = {}) {
  return {
    requestContext: {
      getRaw: (key: string) => values[key],
    },
  } as unknown as Parameters<typeof resolveNullainSkills>[0];
}

describe("native skills resolver", () => {
  it("expõe as skills nativas sem contexto (leituras de metadata)", () => {
    const skills = resolveNullainSkills(contextWith()) as Array<{ name: string }>;
    const names = skills.map((skill) => skill.name);
    expect(names).toContain("skill-creator");
  });

  it("filtra skills desativadas pelo usuário", () => {
    const skills = resolveNullainSkills(
      contextWith({ [SKILL_CONTEXT_KEYS.disabledSkills]: ["skill-creator"] }),
    ) as Array<{ name: string }>;
    expect(skills.map((skill) => skill.name)).not.toContain("skill-creator");
  });

  it("restringe aos grants do bot quando presentes", () => {
    const skills = resolveNullainSkills(
      contextWith({ [SKILL_CONTEXT_KEYS.grantedSkills]: ["skill-creator"] }),
    ) as Array<{ name: string }>;
    expect(skills.map((skill) => skill.name)).toEqual(["skill-creator"]);
  });

  it("embute arquivos de apoio como references para skill_read", () => {
    const skills = resolveNullainSkills(contextWith()) as Array<{
      name: string;
      __referenceContents: Record<string, string>;
    }>;
    const creator = skills.find((skill) => skill.name === "skill-creator");
    expect(creator).toBeDefined();
    expect(creator!.__referenceContents["references/package-patterns.md"]).toContain(
      "Progressive disclosure",
    );
  });
});
