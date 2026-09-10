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

// A doc MCP muda raramente: cachear o listTools (TTL 10 min) evita um
// round-trip de rede a cada criação de skill.
const TOOLS_TTL_MS = 10 * 60_000;
let toolsCacheEntry: { at: number; tools: Record<string, unknown> } | null = null;

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
  const cached = toolsCacheEntry;
  if (cached && Date.now() - cached.at < TOOLS_TTL_MS) return cached.tools;
  try {
    const tools = selectAgentSkillsDocsTools(await (await getClient()).listTools());
    toolsCacheEntry = { at: Date.now(), tools };
    return tools;
  } catch (error) {
    console.warn(
      "[agent-skills-mcp] documentation server unavailable:",
      error instanceof Error ? error.message : error,
    );
    toolsCacheEntry = null;
    const client = globalWithAgentSkills.__nullainAgentSkillsMcpClient;
    delete globalWithAgentSkills.__nullainAgentSkillsMcpClient;
    await client?.disconnect().catch(() => undefined);
    return {};
  }
}

export function clearAgentSkillsDocsCache(): void {
  toolsCacheEntry = null;
}

export async function closeAgentSkillsMcp(): Promise<void> {
  toolsCacheEntry = null;
  const client = globalWithAgentSkills.__nullainAgentSkillsMcpClient;
  delete globalWithAgentSkills.__nullainAgentSkillsMcpClient;
  await client?.disconnect().catch(() => undefined);
}
