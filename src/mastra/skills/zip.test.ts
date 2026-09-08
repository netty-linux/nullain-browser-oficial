import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { deleteUserSkill, getSkill, listSkillFiles, readSkillFile } from "./loader";
import { extractSkillZip } from "./zip";

function archive(files: Record<string, string>): Buffer {
  return Buffer.from(
    zipSync(
      Object.fromEntries(Object.entries(files).map(([path, value]) => [path, strToU8(value)])),
    ),
  );
}

describe("skill zip import", () => {
  it("rejects an invalid archive and a native identifier conflict", () => {
    expect(() => extractSkillZip(archive({ "readme.md": "no skill" }), "zip-test-owner")).toThrow(
      /não contém um SKILL\.md/,
    );
    const duplicate = `---\nname: skill-creator\ndescription: duplicate\n---\n\nDo not install.\n`;
    expect(() => extractSkillZip(archive({ "SKILL.md": duplicate }), "zip-test-owner")).toThrow(
      /Já existe uma skill/,
    );
  });

  it("imports support files into only the authenticated owner's catalog", () => {
    const name = `zip-skill-${Date.now()}`;
    const owner = `owner-${name}`;
    const otherOwner = `other-${name}`;
    const markdown = `---\nname: ${name}\ndescription: Use this skill to validate packaged Agent Skill imports.\nlicense: Apache-2.0\nmetadata:\n  author: "Nullain tests"\n---\n\nFollow the instructions.\n`;
    try {
      const result = extractSkillZip(
        archive({
          [`${name}/SKILL.md`]: markdown,
          [`${name}/references/check.md`]: "check",
          [`${name}/scripts/check.py`]: "print('ok')\n",
          [`${name}/templates/report.md`]: "# Report\n",
          [`${name}/LICENSE.txt`]: "license",
        }),
        owner,
      );
      expect(result).toMatchObject({ skillName: name, files: 5 });
      const installed = getSkill(name, [], owner);
      expect(installed).toMatchObject({
        source: "user",
        frontmatter: { license: "Apache-2.0", metadata: { author: "Nullain tests" } },
      });
      expect(listSkillFiles(installed!)).toEqual([
        "LICENSE.txt",
        "references/check.md",
        "scripts/check.py",
        "templates/report.md",
      ]);
      expect(readSkillFile(installed!, "scripts/check.py")).toBe("print('ok')\n");
      expect(getSkill(name, [], otherOwner)).toBeUndefined();
    } finally {
      deleteUserSkill(owner, name);
      deleteUserSkill(otherOwner, name);
    }
  });

  it("rejects a package whose directory does not match its skill name", () => {
    const markdown = `---\nname: correct-name\ndescription: Validate package naming.\n---\n\nFollow this.\n`;
    expect(() =>
      extractSkillZip(archive({ "wrong-name/SKILL.md": markdown }), "zip-mismatch-owner"),
    ).toThrow(/must match its parent directory/);
  });
});
