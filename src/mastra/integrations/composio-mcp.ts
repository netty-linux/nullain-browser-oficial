/**
 * Composio For You — integração via MCP Connect (não SDK Platform).
 *
 * MÓDULO DE SERVIDOR — importado apenas por route handlers (app/api/**).
 * NUNCA importar de componentes client: o @mastra/mcp usa async_hooks
 * (módulo nativo de Node) e quebra o bundle do browser.
 *
 * Server: https://connect.composio.dev/mcp (HTTP streamable)
 * Auth:   header x-consumer-api-key (consumer key do modo For You)
 *
 * O Composio expõe 7 META-TOOLS que orquestram os 1000+ apps:
 *   COMPOSIO_SEARCH_TOOLS, COMPOSIO_GET_TOOL_SCHEMAS,
 *   COMPOSIO_MULTI_EXECUTE_TOOL, COMPOSIO_MANAGE_CONNECTIONS,
 *   COMPOSIO_WAIT_FOR_CONNECTIONS, COMPOSIO_REMOTE_WORKBENCH,
 *   COMPOSIO_REMOTE_BASH_TOOL.
 *
 * O OAuth 2.0 dos apps é gerenciado PELO COMPOSIO: o agente chama
 * COMPOSIO_MANAGE_CONNECTIONS / COMPOSIO_WAIT_FOR_CONNECTIONS e o Composio
 * gera o link de autorização — nada de REST manual de connected_accounts.
 *
 * Os tools do MCP viram tools do Mastra via MCPClient.listTools() e são
 * adicionados ao kernel quando o toggle Plugins está ON (route.ts).
 */

import { createHash } from "node:crypto";
import type { MCPClient } from "@mastra/mcp";
import { isIntegrationConsumerKey, sanitizeIntegrationKey } from "../../../lib/integration-key";
import { isPluginConnectionActive } from "../../../lib/plugin-connections";

type ClientRegistry = Map<string, MCPClient>;

// O registro vive em globalThis para sobreviver ao hot reload do Next. Um
// singleton de módulo era zerado a cada recompilação, enquanto a instância
// anterior continuava no cache interno do Mastra, causando o bloqueio
// "MCPClient was initialized multiple times".
const globalWithComposio = globalThis as typeof globalThis & {
  __nullainComposioMcpClients?: ClientRegistry;
};
const clients =
  globalWithComposio.__nullainComposioMcpClients ??
  (globalWithComposio.__nullainComposioMcpClients = new Map());

/** Consumer key do modo For You (env). */
export function composioConsumerKey(): string | undefined {
  const key = sanitizeIntegrationKey(process.env.COMPOSIO_CONSUMER_KEY);
  return isIntegrationConsumerKey(key) ? key : undefined;
}

export function composioMcpUrl(): string {
  return process.env.COMPOSIO_MCP_URL ?? "https://connect.composio.dev/mcp";
}

/**
 * Client MCP singleton do Composio Connect.
 *
 * O import do @mastra/mcp é DINÂMICO de propósito: o pacote usa módulos
 * nativos de Node (async_hooks, stream/web) e um import estático faz o
 * Turbopack tentar empacotá-lo também para o bundle do browser — onde não
 * existem. Dinâmico = só carrega no servidor, quando esta função roda.
 */
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function getClient(consumerKey: string): Promise<{ client: MCPClient; id: string }> {
  const id = `nullain-composio-${fingerprint(`${composioMcpUrl()}\0${consumerKey}`)}`;
  const cached = clients.get(id);
  if (cached) return { client: cached, id };

  const { MCPClient: Ctor } = await import("@mastra/mcp");
  const client = new Ctor({
    id,
    servers: {
      composio: {
        url: new URL(composioMcpUrl()),
        requestInit: {
          headers: {
            "x-consumer-api-key": consumerKey,
          },
        },
        timeout: 60_000,
      },
    },
  });
  clients.set(id, client);
  return { client, id };
}

/**
 * Os tools do Composio Connect como Record<string, Tool> do Mastra — pronto
 * para espalhar no `tools` do agente. Conecta sob demanda (o MCPClient gerencia
 * a conexão HTTP streamable).
 */
export async function getComposioTools(sessionKey?: string): Promise<Record<string, unknown>> {
  const normalizedSessionKey = sanitizeIntegrationKey(sessionKey);
  const consumerKey = isIntegrationConsumerKey(normalizedSessionKey)
    ? normalizedSessionKey
    : composioConsumerKey();
  if (!consumerKey) {
    console.warn("[composio-mcp] COMPOSIO_CONSUMER_KEY não configurada");
    return {};
  }
  let clientId = "";
  try {
    const { client, id } = await getClient(consumerKey);
    clientId = id;
    return await client.listTools();
  } catch (error) {
    console.warn(
      "[composio-mcp] falha ao conectar ao Composio Connect:",
      error instanceof Error ? error.message : error,
    );
    // Uma conexão quebrada não deve envenenar todas as tentativas seguintes.
    const failedClient = clientId ? clients.get(clientId) : undefined;
    if (failedClient) {
      clients.delete(clientId);
      await failedClient.disconnect().catch(() => undefined);
    }
    return {};
  }
}

type ExecutableTool = {
  execute?: (
    input: Record<string, unknown>,
    context?: { abortSignal?: AbortSignal; runId?: string },
  ) => Promise<unknown>;
};

/**
 * Consulta somente toolkits cuja conexão foi iniciada pelo usuário. O
 * MANAGE_CONNECTIONS é a fonte de verdade do Connect MCP; com
 * reinitiate_all=false ele preserva conexões ativas.
 */
export async function getActiveComposioConnections(
  toolkits: readonly string[],
  sessionKey?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const tools = await getComposioTools(sessionKey);
  const entry = Object.entries(tools).find(([name]) =>
    name.toUpperCase().endsWith("COMPOSIO_MANAGE_CONNECTIONS"),
  );
  const tool = entry?.[1] as ExecutableTool | undefined;
  if (!tool?.execute) throw new Error("COMPOSIO_MANAGE_CONNECTIONS_UNAVAILABLE");

  const active: string[] = [];
  for (const toolkit of toolkits) {
    const result = await tool.execute(
      { toolkits: [toolkit], reinitiate_all: false },
      { abortSignal: signal, runId: crypto.randomUUID() },
    );
    if (isPluginConnectionActive(result)) active.push(toolkit);
  }
  return active;
}

/** Fecha a conexão MCP (útil em shutdown/testes). */
export async function closeComposioMcp(): Promise<void> {
  const activeClients = [...clients.values()];
  clients.clear();
  await Promise.all(activeClients.map((client) => client.disconnect().catch(() => undefined)));
}
