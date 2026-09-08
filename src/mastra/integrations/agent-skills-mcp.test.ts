import { describe, expect, it } from "vitest";
import { selectAgentSkillsDocsTools } from "./agent-skills-mcp";

describe("Agent Skills documentation MCP", () => {
  it("exposes only its read-only documentation tools", () => {
    const search = {};
    const filesystem = {};
    expect(
      selectAgentSkillsDocsTools({
        agentSkills_search_agent_skills: search,
        agentSkills_query_docs_filesystem_agent_skills: filesystem,
        agentSkills_submit_feedback: {},
      }),
    ).toEqual({
      agentSkills_search_agent_skills: search,
      agentSkills_query_docs_filesystem_agent_skills: filesystem,
    });
  });
});
