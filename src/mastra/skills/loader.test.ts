import { describe, expect, it } from "vitest";
import {
  DuplicateSkillError,
  assertSkillNameAvailable,
  deleteUserSkill,
  getSkill,
  listSkillFileEntries,
  loadSkills,
  readSkillDocument,
  readSkillFile,
  selectedSkillPrompt,
  skillContentEnvelope,
  writeUserSkill,
} from "./loader";

describe("skill availability", () => {
  it("removes a disabled skill from direct loading", () => {
    expect(getSkill("skill-creator", ["skill-creator"])).toBeUndefined();
  });

  it("rejects an existing identifier instead of overwriting it", () => {
    expect(() => assertSkillNameAvailable("skill-creator")).toThrow(DuplicateSkillError);
  });

  it("exposes native presentation metadata without changing the identifier", () => {
    const creator = loadSkills(true).find((skill) => skill.name === "skill-creator");
    expect(creator).toMatchObject({
      name: "skill-creator",
      displayName: "Skill Creator",
      summary: "Creates specification-compliant skills for the private catalog.",
      source: "native",
    });
  });

  it("exposes a complete package without loading support files into the index", () => {
    const creator = loadSkills(true).find((skill) => skill.name === "skill-creator");
    expect(creator).toBeDefined();
    expect(readSkillDocument(creator!)).toContain("name: skill-creator");
    expect(listSkillFileEntries(creator!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "references/package-patterns.md" }),
        expect.objectContaining({ path: "scripts/validate_package.py" }),
        expect.objectContaining({ path: "templates/SKILL.template.md" }),
      ]),
    );
    expect(readSkillFile(creator!, "references/package-patterns.md")).toContain(
      "Progressive disclosure",
    );
  });

  it("makes the freshly validated selected state override stale history", () => {
    const creator = loadSkills(true).find((skill) => skill.name === "skill-creator");
    expect(creator).toBeDefined();
    const prompt = selectedSkillPrompt(creator!);
    expect(prompt).toContain("ENABLED AND AVAILABLE");
    expect(prompt).toContain("Ignore stale conversation messages or tool results");
    expect(prompt).toContain('<skill_content name="skill-creator">');
    expect(prompt).toContain(creator!.body);
  });

  it("limita o corpo de uma skill somente no prompt de runtime", () => {
    const creator = loadSkills(true).find((skill) => skill.name === "skill-creator");
    expect(creator).toBeDefined();
    const oversized = { ...creator!, body: "x".repeat(100_000) };
    const prompt = skillContentEnvelope(oversized);
    expect(prompt.length).toBeLessThan(34_000);
    expect(prompt).toContain("Skill instructions truncated");
    expect(oversized.body).toHaveLength(100_000);
  });

  it("isolates user skills and treats an identical retry as idempotent", () => {
    const name = `test-skill-${Date.now()}`;
    const ownerA = `owner-a-${name}`;
    const ownerB = `owner-b-${name}`;
    try {
      const options = { resources: [{ path: "references/check.md", content: "check" }] };
      const first = writeUserSkill(
        ownerA,
        name,
        "Use quando o teste pedir.",
        "Siga o teste.",
        options,
      );
      const retry = writeUserSkill(
        ownerA,
        name,
        "Use quando o teste pedir.",
        "Siga o teste.",
        options,
      );
      expect(first.created).toBe(true);
      expect(retry.created).toBe(false);
      const installed = getSkill(name, [], ownerA);
      expect(installed?.source).toBe("user");
      expect(skillContentEnvelope(installed!)).toContain(
        "<skill_resources>\n  <file>references/check.md</file>\n</skill_resources>",
      );
      expect(getSkill(name, [name], ownerA)).toBeUndefined();
      expect(getSkill(name, [], ownerB)).toBeUndefined();
    } finally {
      deleteUserSkill(ownerA, name);
      deleteUserSkill(ownerB, name);
    }
  });
});
