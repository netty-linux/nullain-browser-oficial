import { describe, expect, it } from "vitest";
import { AgentSkillValidationError, createAgentSkillDocument, parseAgentSkill } from "./spec";

describe("Agent Skills specification", () => {
  it("parses every official frontmatter field and YAML block scalars", () => {
    const parsed = parseAgentSkill(`---
name: data-review
description: >-
  Review structured data and explain anomalies. Use when the user asks to
  inspect a dataset or validate a report.
license: Apache-2.0
compatibility: Requires Python 3.12+
metadata:
  author: "Nullain"
  version: "1.0"
allowed-tools: Bash(python:*) Read
---

# Data review
`);
    expect(parsed.frontmatter).toEqual({
      name: "data-review",
      description:
        "Review structured data and explain anomalies. Use when the user asks to inspect a dataset or validate a report.",
      license: "Apache-2.0",
      compatibility: "Requires Python 3.12+",
      metadata: { author: "Nullain", version: "1.0" },
      "allowed-tools": "Bash(python:*) Read",
    });
    expect(parsed.body).toBe("# Data review");
  });

  it.each([
    ["uppercase name", "Bad-Name", "description", "Valid description"],
    ["empty description", "valid-name", "description", ""],
    ["directory mismatch", "valid-name", "directory", "other-name"],
  ])("rejects %s", (_label, name, mode, value) => {
    const markdown = `---\nname: ${name}\ndescription: ${mode === "description" ? value : "Valid description"}\n---\n`;
    expect(() => parseAgentSkill(markdown, mode === "directory" ? value : undefined)).toThrow(
      AgentSkillValidationError,
    );
  });

  it("serializes Nullain UI data under the standard metadata map", () => {
    const markdown = createAgentSkillDocument(
      {
        name: "release-notes",
        description: "Write release notes. Use when preparing a product release.",
        metadata: { "nullain-display-name": "Release Notes" },
      },
      "Write concise notes.",
    );
    expect(markdown).toContain("metadata:\n  nullain-display-name: Release Notes");
    expect(parseAgentSkill(markdown).frontmatter.metadata).toEqual({
      "nullain-display-name": "Release Notes",
    });
  });

  it("accepts lowercase international identifiers like the reference validator", () => {
    expect(
      parseAgentSkill("---\nname: análise-dados\ndescription: Analyze supplied data.\n---\n")
        .frontmatter.name,
    ).toBe("análise-dados");
  });
});
