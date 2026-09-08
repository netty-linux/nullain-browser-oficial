/**
 * Official Agent Skills documentation MCP.
 *
 * The server is read-only and is intentionally exposed only while the user is
 * explicitly creating a skill. It informs authoring; local discovery and
 * validation remain deterministic application responsibilities.
 */
import type { MCPClient } from "@mastra/mcp";

const DEFAULT_AGENT_SKILLS_MCP_URL = "https://agentskills.io/mcp";

const globalWithAgentSkills = globalThis as typeof globalThis & {
  __nullainAgentSkillsMcpClient?: MCPClient;
};

export function agentSkillsMcpUrl(): string {
  return process.env.AGENT_SKILLS_MCP_URL ?? DEFAULT_AGENT_SKILLS_MCP_URL;
}

async function getClient(): Promise<MCPClient> {
  if (globalWithAgentSkills.__nullainAgentSkillsMcpClient) {
    return globalWithAgentSkills.__nullainAgentSkillsMcpClient;
  }
  const { MCPClient: Client } = await import("@mastra/mcp");
  const endpoint = new URL(agentSkillsMcpUrl());
  const client = new Client({
    id: "nullain-agent-skills-docs",
    servers: {
      agentSkills: {
        url: endpoint,
        allowedHosts: [endpoint.host],
        forwardInstructions: true,
        timeout: 30_000,
      },
    },
  });
  globalWithAgentSkills.__nullainAgentSkillsMcpClient = client;
  return client;
}

export function selectAgentSkillsDocsTools(
  tools: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => {
      const normalized = name.toLowerCase();
      return (
        normalized.endsWith("search_agent_skills") ||
        normalized.endsWith("query_docs_filesystem_agent_skills")
      );
    }),
  );
}

export async function getAgentSkillsDocsTools(): Promise<Record<string, unknown>> {
  try {
    return selectAgentSkillsDocsTools(await (await getClient()).listTools());
  } catch (error) {
    console.warn(
      "[agent-skills-mcp] documentation server unavailable:",
      error instanceof Error ? error.message : error,
    );
    const client = globalWithAgentSkills.__nullainAgentSkillsMcpClient;
    delete globalWithAgentSkills.__nullainAgentSkillsMcpClient;
    await client?.disconnect().catch(() => undefined);
    return {};
  }
}

export async function closeAgentSkillsMcp(): Promise<void> {
  const client = globalWithAgentSkills.__nullainAgentSkillsMcpClient;
  delete globalWithAgentSkills.__nullainAgentSkillsMcpClient;
  await client?.disconnect().catch(() => undefined);
}
