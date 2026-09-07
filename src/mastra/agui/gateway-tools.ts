/**
 * ============================================================================
 * Gateway tools da Nullain → OpenBot.
 *
 * Quando a Nullain roda como coworker `remote-ag-ui` dentro do OpenBot, o OpenBot
 * envia no RunAgentInput:
 *   - `tools`: todas as tools que o bot OFERECE (computer + concedidas via gateway)
 *   - `forwardedProps.openbotDeploymentTools`: as tools que O GATEWAY executa
 *     (tool MCP governadas: grant → política → audit), prefixadas `mcp__`
 *   - `forwardedProps.openbotRun`: o run ASSINADO (botId, actorId, runId, exp)
 *
 * Para chamar uma tool governada de volta, a Nullain faz:
 *   POST /api/agent-tools/call  (no OpenBot)
 *     header: x-openbot-agent-token = <callback token>
 *     body:   { name: "mcp__server__tool", args, run: <openbotRun assinado> }
 *
 * O OpenBot então decide (grant → política → audit) e diala o servidor MCP
 * (ex.: Composio com x-api-key). A Nullain NUNCA diala o vendor diretamente
 * quando está dentro do canal do OpenBot — essa é a regra de ouro da FASE 2.
 *
 * Este módulo cria tools executáveis do Mastra (createTool) a partir das tools
 * `mcp__` que o gateway anuncia, para que o kernel da Nullain possa chamá-las
 * pelo gateway.
 * ============================================================================
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const OPENBOT_TOOL_URL =
  process.env.OPENBOT_TOOL_URL ?? "http://localhost:3001/api/agent-tools/call";
const CALLBACK_TOKEN = process.env.OPENBOT_CALLBACK_TOKEN?.trim();

/** Se o gateway do OpenBot está configurado (URL + token). */
export function gatewayConfiguredForOpenBot(): boolean {
  return Boolean(OPENBOT_TOOL_URL && CALLBACK_TOKEN);
}

/** Um tool `mcp__` que o gateway anunciou no forward. */
export type GatewayToolOffer = {
  name: string; // ex.: mcp__composio__GITHUB_GET_A_REPOSITORY
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

export function isGatewayToolOffer(value: unknown): value is GatewayToolOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as Partial<GatewayToolOffer>;
  return (
    typeof offer.name === "string" &&
    /^(?:mcp__|openbot_computer_)[A-Za-z0-9_.:-]{1,159}$/.test(offer.name) &&
    typeof offer.description === "string" &&
    offer.description.length <= 4_000 &&
    Boolean(offer.parameters) &&
    typeof offer.parameters === "object" &&
    !Array.isArray(offer.parameters)
  );
}

/**
 * Transforma um JSON Schema (AG-UI parameters) num schema zod aceito pelo
 * createTool do Mastra. Converte objeto JSON Schema para zod (tipos básicos).
 */
function jsonSchemaToZod(parameters: Record<string, unknown>): z.ZodTypeAny {
  const props = (parameters?.properties ?? {}) as Record<
    string,
    { type?: string; description?: string; required?: boolean }
  >;
  const required = (parameters?.required ?? []) as string[];
  const shape: Record<string, z.ZodTypeAny> = Object.create(null);
  for (const [name, schema] of Object.entries(props)) {
    const base =
      schema.type === "integer"
        ? z.number()
        : schema.type === "number"
          ? z.number()
          : schema.type === "boolean"
            ? z.boolean()
            : z.string();
    const field = required.includes(name)
      ? base.describe(schema?.description ?? name)
      : base.optional().describe(schema?.description ?? name);
    shape[name] = field;
  }
  return z.object(shape).strict();
}

/**
 * Cria uma tool Mastra que chama uma tool `mcp__` de volta pelo gateway do OpenBot.
 *
 * Cada tool recebe o `run` assinado (openbotRun) que viajou no forward deste run —
 * o OpenBot só executa a chamada se o run for válido e do bot certo.
 */
export function makeGatewayTool(
  offer: GatewayToolOffer,
  runAssertion: string,
): ReturnType<typeof createTool> {
  return createTool({
    id: offer.name,
    description: offer.description,
    inputSchema: jsonSchemaToZod(offer.parameters),
    execute: async (inputData) => {
      const args = (inputData ?? {}) as Record<string, unknown>;
      if (!CALLBACK_TOKEN) {
        return "Refused. This Nullain has no callback token for the OpenBot gateway.";
      }
      if (!runAssertion) {
        return "Refused. This run carried no signed statement of which Bot and person it is for.";
      }
      try {
        const response = await fetch(OPENBOT_TOOL_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-openbot-agent-token": CALLBACK_TOKEN,
          },
          body: JSON.stringify({
            name: offer.name,
            args: args ?? {},
            run: runAssertion,
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) {
          const body = (await response.text().catch(() => "")).slice(0, 500);
          return `Refused by the gateway (${response.status}): ${body}`;
        }
        const body = (await response.json()) as { text?: string; isError?: boolean };
        return body.text ?? "The tool returned nothing.";
      } catch (error) {
        return `That tool could not be called: ${
          error instanceof Error ? error.message : "unknown error"
        }`;
      }
    },
  });
}

/**
 * Extrai do forwardedProps do run: o run assinado, o id do bot e a lista de
 * tools que o gateway executa.
 */
export function parseOpenBotForward(input: unknown): {
  runAssertion: string;
  deploymentTools: string[];
  botId: string;
} {
  const fwd = (input as { forwardedProps?: Record<string, unknown> })?.forwardedProps;
  const runAssertion = typeof fwd?.openbotRun === "string" ? fwd.openbotRun : "";
  const deploymentTools = Array.isArray(fwd?.openbotDeploymentTools)
    ? (fwd.openbotDeploymentTools as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const botId = typeof fwd?.openbotBotId === "string" ? fwd.openbotBotId : "";
  return { runAssertion, deploymentTools, botId };
}

/**
 * Filtra as tools oferecidas: as que o GATEWAY executa (as `mcp__` que estão em
 * openbotDeploymentTools). Só essas viram tools de callback — uma tool que o
 * gateway não roda (ex.: um componente do browser) não é exposta.
 */
export function offerMatchesGateway(offer: GatewayToolOffer, deploymentTools: string[]): boolean {
  return deploymentTools.includes(offer.name);
}
