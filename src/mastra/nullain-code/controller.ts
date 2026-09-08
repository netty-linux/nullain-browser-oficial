import { AgentController } from "@mastra/core/agent-controller";
import { createCodingAgent } from "@mastra/core/coding-agent";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { Workspace } from "@mastra/core/workspace";
import { MODELS } from "../models";

export const NULLAIN_CODE_CONTROLLER_ID = "nullainCode";
const workspaces = new Map<string, Workspace>();

export function registerNullainCodeWorkspace(scope: string, workspace: Workspace) {
  workspaces.set(scope, workspace);
}

export function unregisterNullainCodeWorkspace(scope: string) {
  workspaces.delete(scope);
}

export function createNullainCodeAgent() {
  return createCodingAgent({
    id: "nullain-code-agent",
    name: "Nullain Code",
    model: MODELS.nullainCode,
    workspace: undefined,
    tools: {},
    instructions: `Você é o Nullain Code, um assistente de engenharia de software limitado ao projeto aberto.
Leia os arquivos necessários e produza primeiro um plano verificável. No modo plan, nunca altere arquivos.
Envie o plano pelo recurso submit_plan e aguarde a decisão humana. Só no modo build, após a aprovação
da execução atual, você pode editar arquivos. Você não possui terminal, subprocessos, rede, navegador,
scripts, comandos de sistema, git ou acesso fora do filesystem do projeto. Não tente contornar esses limites.`,
  });
}

export function createNullainCodeController(storage: MastraCompositeStore) {
  return new AgentController({
    id: NULLAIN_CODE_CONTROLLER_ID,
    storage,
    agent: createNullainCodeAgent(),
    workspace: ({ requestContext }) => {
      const controller = requestContext.get("controller") as { scope?: string } | undefined;
      const workspace = controller?.scope ? workspaces.get(controller.scope) : undefined;
      if (!workspace) throw new Error("Workspace da sessão Nullain Code não registrado.");
      return workspace;
    },
    defaultModeId: "plan",
    modes: [
      {
        id: "plan",
        name: "Plan",
        transitionsTo: "build",
        metadata: { default: true },
        availableTools: [
          "view",
          "list_files",
          "find_files",
          "search_content",
          "file_stat",
          "write_file",
          "mkdir",
          "ask_user",
          "submit_plan",
          "task_write",
          "task_update",
          "task_complete",
          "task_check",
        ],
      },
      {
        id: "build",
        name: "Build",
        availableTools: [
          "view",
          "list_files",
          "find_files",
          "search_content",
          "file_stat",
          "write_file",
          "string_replace_lsp",
          "delete_file",
          "mkdir",
          "ask_user",
          "task_write",
          "task_update",
          "task_complete",
          "task_check",
        ],
      },
    ],
    disableBuiltinTools: ["subagent"],
    toolCategoryResolver(toolName) {
      if (["view", "list_files", "find_files", "search_content", "file_stat"].includes(toolName)) {
        return "read";
      }
      if (["write_file", "string_replace_lsp", "delete_file", "mkdir"].includes(toolName)) {
        return "edit";
      }
      return "other";
    },
  });
}
