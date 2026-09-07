import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import type { BaseEvent } from "@ag-ui/core";
import { mastra } from "@/src/mastra";
import { kernelStreamOptions } from "@/src/mastra/agents/kernel-agent";
import {
  AG_UI_CONTENT_TYPE,
  encodeSSE,
  mastraChunkToAguiEvents,
  runError,
  runFinished,
  runStarted,
  translateMessages,
  type AgUIStreamState,
} from "@/src/mastra/agui/adapter";
import {
  gatewayConfiguredForOpenBot,
  isGatewayToolOffer,
  makeGatewayTool,
  offerMatchesGateway,
  parseOpenBotForward,
  type GatewayToolOffer,
} from "@/src/mastra/agui/gateway-tools";

export const maxDuration = 300;

/**
 * ============================================================================
 * Adaptador AG-UI da Nullain — expõe os agentes Mastra como endpoints AG-UI
 * selecionáveis, para o OpenBot registrar a Nullain como coworker
 * (`remote-ag-ui`). Enxerto (Fase 1), não reescrita.
 *
 *   POST /api/ag-ui/[agent]
 *     header Authorization: Bearer <AG_UI_TOKEN>  (proteção do endpoint)
 *     or header x-nullain-agent-token: <AG_UI_TOKEN>
 *     body: RunAgentInput { threadId, runId, messages, tools?, ... }
 *
 * Retorna um stream SSE com os eventos AG-UI (RUN_STARTED, TEXT_MESSAGE_*,
 * RUN_FINISHED), o mesmo contrato dos Bots de referência do OpenBot.
 * ============================================================================
 */

/** Agentes selecionáveis expostos pelo adaptador AG-UI. */
const EXPOSED_AGENTS = new Set([
  "kernelAgent", // supervisor Nullain (default do /api/chat)
  "chatAgent", // legado preservado
  "researchAgent",
  "codingAgent",
  "synthesisAgent",
]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function tokensMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agent: string }> },
) {
  const { agent: agentKey } = await params;

  // 1. Agente deve estar exposto.
  if (!EXPOSED_AGENTS.has(agentKey)) {
    return NextResponse.json(
      { error: `Agent '${agentKey}' is not exposed via AG-UI.` },
      { status: 404 },
    );
  }

  // 2. Autenticação do endpoint (token compartilhado).
  const token = process.env.AG_UI_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "AG-UI não configurado." }, { status: 503 });
  }
  const auth =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-nullain-agent-token");
  if (!auth || !tokensMatch(auth, token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 3. Parse do RunAgentInput.
  let input: {
    threadId?: string;
    runId?: string;
    messages?: Array<{
      role?: string;
      content?: unknown;
      toolCallId?: string;
      toolCalls?: unknown;
    }>;
  };
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    input = JSON.parse(rawBody) as typeof input;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "A RunAgentInput object is required." }, { status: 400 });
  }

  if (input.messages && (!Array.isArray(input.messages) || input.messages.length > 200)) {
    return NextResponse.json({ error: "Invalid messages." }, { status: 400 });
  }
  const threadId =
    typeof input.threadId === "string" && SAFE_ID.test(input.threadId)
      ? input.threadId
      : crypto.randomUUID();
  const runId =
    typeof input.runId === "string" && SAFE_ID.test(input.runId)
      ? input.runId
      : crypto.randomUUID();
  const agInput = { ...input, threadId, runId } as Parameters<typeof runStarted>[0];

  // 4b. Gateway tools: quando o run vem do OpenBot (forwardedProps), as tools
  // que o gateway executa (mcp__* do Composio E openbot_computer_* do browser)
  // viram tools de callback. A Nullain NUNCA diala o vendor diretamente — chama
  // de volta pelo /api/agent-tools/call.
  const rawTools = (input as { tools?: unknown }).tools;
  const toolsFromOpenBot: GatewayToolOffer[] = Array.isArray(rawTools)
    ? rawTools.filter(isGatewayToolOffer).slice(0, 100)
    : [];
  const { runAssertion, deploymentTools } = parseOpenBotForward(input);
  const gatewayEnabled = gatewayConfiguredForOpenBot();
  const offeredGatewayTools = gatewayEnabled
    ? toolsFromOpenBot.filter(
        (t) =>
          offerMatchesGateway(t, deploymentTools) &&
          (t.name.startsWith("mcp__") || t.name.startsWith("openbot_computer_")),
      )
    : [];
  const gatewayToolMap: Record<string, ReturnType<typeof makeGatewayTool>> = {};
  if (offeredGatewayTools.length > 0 && runAssertion) {
    for (const offer of offeredGatewayTools) {
      gatewayToolMap[offer.name] = makeGatewayTool(offer, runAssertion);
    }
    // Observabilidade do canal coworker (diagnóstico H2 de 2026-09-07): neste
    // endpoint as tools do Computador vêm EXCLUSIVAMENTE do anúncio do gateway
    // do OpenBot — NÃO injetamos clientTools aqui de propósito. O merge do
    // convertTools do Mastra faz clientSideTools sobrescrever toolsetTools em
    // colisão de nome, então injetar as client tools substituiria as tools
    // server-executadas do gateway e burlaria o grant (grant → política →
    // audit) da FASE 2. Se no coworker a navegação funciona mas as ferramentas
    // de interação não aparecem, a causa é o OpenBot não anunciá-las em
    // forwardedProps.openbotDeploymentTools — este log torna isso visível.
    console.info(
      `[ag-ui] tools anunciadas pelo gateway (${gatewayToolMap.size}): ${offeredGatewayTools
        .map((t) => t.name)
        .join(", ")}`,
    );
  }

  // 4. Agente do Mastra.
  const agent = mastra.getAgent(agentKey as Parameters<typeof mastra.getAgent>[0]);

  // 5. Stream AG-UI → SSE, traduzindo o stream do Mastra em eventos.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Parameters<typeof encodeSSE>[0]) =>
        controller.enqueue(encoder.encode(encodeSSE(event)));

      // RUN_STARTED primeiro (padrão dos Bots do OpenBot).
      send(runStarted(agInput));

      // Estado de tradução texto/tool.
      const state: AgUIStreamState = { textOpen: false, messageIndex: 0 };

      try {
        const messages = translateMessages(agInput);
        const streamOptions: Record<string, unknown> = {
          // Kernel: delegação + memory por thread (paridade com /api/chat).
          ...(agentKey === "kernelAgent"
            ? {
                ...kernelStreamOptions({
                  maxSteps: 12,
                  computerEnabled: Object.keys(gatewayToolMap).some((name) =>
                    name.startsWith("openbot_computer_"),
                  ),
                }),
                memory: { thread: `nt-${threadId}`, resource: "default-resource" },
              }
            : {}),
          // Gateway tools: as tools `mcp__` concedidas entram como tools
          // server-side (toolsets), que a Nullain executa e chama de volta pelo
          // /api/agent-tools/call do OpenBot.
          ...(Object.keys(gatewayToolMap).length > 0
            ? { toolsets: { gateway: gatewayToolMap } }
            : {}),
        };

        const result = await agent.stream(messages as never, streamOptions as never);
        const full = result.fullStream as unknown as AsyncIterable<{
          type?: string;
          payload?: Record<string, unknown>;
        }>;

        for await (const chunk of full) {
          const events = mastraChunkToAguiEvents(chunk, agInput, state);
          for (const event of events) send(event);
        }

        // Fecha qualquer texto ainda aberto (defensivo).
        if (state.textOpen) {
          send({
            type: "TEXT_MESSAGE_END",
            messageId: `msg_${runId}_${state.messageIndex}`,
          } as BaseEvent);
          state.textOpen = false;
        }

        send(runFinished(agInput));
      } catch (error) {
        console.error("[ag-ui] agent stream failed", error);
        if (state.textOpen) {
          send({
            type: "TEXT_MESSAGE_END",
            messageId: `msg_${runId}_${state.messageIndex}`,
          } as BaseEvent);
        }
        send(runError("The Bot could not answer."));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": AG_UI_CONTENT_TYPE,
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

/** GET simples p/ healthcheck e teste. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agent: string }> },
) {
  const { agent } = await params;
  return NextResponse.json({
    status: "ok",
    protocol: "ag-ui",
    agents: [...EXPOSED_AGENTS],
    requested: agent,
  });
}
