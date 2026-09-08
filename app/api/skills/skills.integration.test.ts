import { afterEach, describe, expect, it, vi } from "vitest";

const ownerId = "skills-route-integration-owner";

vi.mock("@/lib/server/nullain-auth", () => ({
  getNullainSession: async () => ({ user: { id: ownerId, email: "skills@test.local" } }),
}));

import { GET as listSkills, POST as importSkill } from "./route";
import { DELETE as deleteSkill, GET as getSkillDetails } from "./[name]/route";
import { GET as getSkillFile } from "./[name]/files/route";
import { deleteUserSkill, getSkill } from "@/src/mastra/skills/loader";

const name = "route-validation-skill";

function mutationRequest(body?: BodyInit) {
  return new Request("http://localhost/api/skills", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body,
  });
}

afterEach(() => deleteUserSkill(ownerId, name));

describe("authenticated skills routes", () => {
  it("serves package metadata and individual resources for progressive disclosure", async () => {
    const listed = (await (
      await listSkills(new Request("http://localhost/api/skills"))
    ).json()) as {
      skills: Array<{ name: string; resourceCount: number; resourceKinds: string[] }>;
    };
    expect(listed.skills).toContainEqual(
      expect.objectContaining({
        name: "skill-creator",
        resourceCount: 3,
        resourceKinds: expect.arrayContaining(["references", "scripts", "templates"]),
      }),
    );

    const context = { params: Promise.resolve({ name: "skill-creator" }) };
    const details = (await (
      await getSkillDetails(new Request("http://localhost/api/skills/skill-creator"), context)
    ).json()) as { document: string; files: Array<{ path: string; size: number }> };
    expect(details.document).toContain("name: skill-creator");
    expect(details.files).toContainEqual(
      expect.objectContaining({ path: "scripts/validate_package.py" }),
    );

    const resource = (await (
      await getSkillFile(
        new Request(
          "http://localhost/api/skills/skill-creator/files?path=references%2Fpackage-patterns.md",
        ),
        context,
      )
    ).json()) as { content: string; truncated: boolean };
    expect(resource.content).toContain("Progressive disclosure");
    expect(resource.truncated).toBe(false);
  });

  it("imports, detects a duplicate, lists only scoped data, and deletes a user skill", async () => {
    const markdown = `---\nname: ${name}\ndescription: Use this skill to validate authenticated imports.\ncompatibility: Requires Nullain Agent\nmetadata:\n  author: "Nullain tests"\n---\n\nFollow the test.\n`;
    const form = () => {
      const data = new FormData();
      data.append("file", new File([markdown], "SKILL.md", { type: "text/markdown" }));
      return data;
    };

    expect((await importSkill(mutationRequest(form()))).status).toBe(200);
    expect(getSkill(name, [], ownerId)?.frontmatter).toMatchObject({
      compatibility: "Requires Nullain Agent",
      metadata: { author: "Nullain tests" },
    });
    expect((await importSkill(mutationRequest(form()))).status).toBe(409);

    const listed = (await (
      await listSkills(new Request("http://localhost/api/skills"))
    ).json()) as {
      skills: Array<{ name: string; source: string }>;
    };
    expect(listed.skills).toContainEqual(expect.objectContaining({ name, source: "user" }));

    const protectedResponse = await deleteSkill(
      new Request("http://localhost/api/skills/skill-creator", {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ name: "skill-creator" }) },
    );
    expect(protectedResponse.status).toBe(403);

    const deleted = await deleteSkill(
      new Request(`http://localhost/api/skills/${name}`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ name }) },
    );
    expect(deleted.status).toBe(200);
  });
});
