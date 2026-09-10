import "server-only";

import { createSkillCreatorToolset } from "@/src/mastra/tools/skill-tools";
import { createLocalComputerTools } from "@/src/mastra/tools/local-computer-tools";
import { getComposioTools } from "@/src/mastra/integrations/composio-mcp";
import { getAgentSkillsDocsTools } from "@/src/mastra/integrations/agent-skills-mcp";
import { createWaveSpeedToolset } from "@/src/mastra/tools/wavespeed-tools";
import type { resolveBotRuntime } from "./bot-runtime-repository";

export type BuildToolsetsOptions = {
  ownerId?: string;
  allowSkillCreation: boolean;
  botRuntime: ReturnType<typeof resolveBotRuntime> | null;
  integrations?: boolean;
  sessionIntegrationKey?: string | null;
  generation?: boolean;
  attachedImageDataUrl?: string | null;
  useLocalComputer: boolean;
};

export async function buildChatToolsets({
  ownerId,
  allowSkillCreation,
  botRuntime,
  integrations,
  sessionIntegrationKey,
  generation,
  attachedImageDataUrl,
  useLocalComputer,
}: BuildToolsetsOptions) {
  const localComputerTools =
    useLocalComputer && botRuntime && ownerId
      ? createLocalComputerTools({
          ownerUserId: ownerId,
          botId: botRuntime.bot.id,
          conversationId: botRuntime.conversation.id,
        })
      : {};

  const composioTools = integrations
    ? await getComposioTools(sessionIntegrationKey || undefined)
    : {};
  const agentSkillsDocsTools = allowSkillCreation ? await getAgentSkillsDocsTools() : {};

  return {
    toolsets: {
      // Descoberta/leitura de skills é NATIVA (Agent.skills + tools
      // skill/skill_read/skill_search). Aqui só o create_skill (gated).
      ...createSkillCreatorToolset({ ownerId, allowCreate: allowSkillCreation }),
      ...(generation ? createWaveSpeedToolset(attachedImageDataUrl) : {}),
      ...(Object.keys(composioTools).length > 0 ? { composio: composioTools } : {}),
      ...(Object.keys(agentSkillsDocsTools).length > 0
        ? { agentSkillsDocs: agentSkillsDocsTools }
        : {}),
      ...(Object.keys(localComputerTools).length > 0 ? { localComputer: localComputerTools } : {}),
    },
    composioTools,
  };
}
