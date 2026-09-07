/**
 * ============================================================================
 * Adaptador AG-UI da Nullain (enxerto Fase 1).
 *
 * Converte uma conversa AG-UI (RunAgentInput) numa chamada `agent.stream()`
 * do Mastra e devolve os eventos AG-UI codificados em SSE — o contrato exato
 * que o OpenBot espera consumir de um coworker `remote-ag-ui`.
 *
 * O wire foi mapeado a partir dos Bots de referência do próprio OpenBot
 * (`agent-bot::src/index.ts` e `agent-langgraph::src/index.ts` — commit
 * ba3ab6e). Nada aqui depende do servidor do OpenBot: é um endpoint AG-UI
 * puro, testável e auditável.
 * ============================================================================
 */
import type { BaseEvent, RunAgentInput } from "@ag-ui/core";

/**
 * Codifica um evento AG-UI em uma linha SSE. Formato replicado do
 * `EventEncoder.encodeSSE` do `@ag-ui/encoder` (v0.0.59), traduzido na mão
 * para não carregar a dependência de protobuf/media-type do encoder completo.
 */
export function encodeSSE(event: BaseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Content-Type que o OpenBot e o AG-UI client esperam ler. */
export const AG_UI_CONTENT_TYPE = "text/event-stream";

/**
 * Traduz as mensagens AG-UI de entrada para o formato de mensagens que o
 * `agent.stream()` do Mastra aceita.
 *
 * O AG-UI (e o OpenBot) envia CoreMessage (`{ role, content }`) — system,
 * developer, user, tool e assistant. O Mastra aceita esse formato, mas é
 * estrito: system/developer EXIGEM `content` como string/array (nunca `parts`).
 * Por isso passamos as mensagens tal como vieram, apenas normalizando o
 * `content` para string — sem converter para o formato UIMessage com `parts`,
 * que quebra system messages.
 */
export function translateMessages(input: RunAgentInput): unknown[] {
  // O input já está em CoreMessage; apenas garante content string e ignora
  // mensagens sem conteúdo. Assistant sem toolCalls com content vazio também
  // é aceito pelo Mastra (viro um turno vazio que ele tolera).
  const messages: unknown[] = [];
  for (const message of input.messages ?? []) {
    const role = message.role;
    if (
      role !== "system" &&
      role !== "developer" &&
      role !== "user" &&
      role !== "assistant" &&
      role !== "tool"
    )
      continue;
    const content = translateContent(message.content);
    // Mantém metadados relevantes (toolCallId/toolCalls) para assistant/tool.
    messages.push({
      role,
      ...(content !== undefined ? { content } : {}),
      ...(role === "tool" && message.toolCallId ? { toolCallId: message.toolCallId } : {}),
      ...(role === "assistant" && message.toolCalls ? { toolCalls: message.toolCalls } : {}),
    });
  }
  return messages;
}

function translateContent(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // Converte partes para um texto simples (não suportamos partes multimodais
    // complexas neste enxerto — o kernel tem inputProcessor que limpa imagens).
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as { type?: string; text?: string };
          if (typeof p.text === "string") return p.text;
        }
        return "";
      })
      .join(" ")
      .trim();
  }
  return undefined;
}

export interface AgUIStreamState {
  textOpen: boolean;
  messageIndex: number;
  /** toolCallId → toolName dos TOOL_CALL_START já emitidos. */
  toolCallsStarted?: Map<string, string>;
  /** toolCallIds que já receberam TOOL_CALL_ARGS (evita duplicar delta). */
  toolArgsSent?: Set<string>;
}

/** Garante os mapas de tool no state (criados sob demanda — campos opcionais). */
function toolState(state: AgUIStreamState): {
  started: Map<string, string>;
  argsSent: Set<string>;
} {
  if (!state.toolCallsStarted) state.toolCallsStarted = new Map();
  if (!state.toolArgsSent) state.toolArgsSent = new Set();
  return { started: state.toolCallsStarted, argsSent: state.toolArgsSent };
}

/** Fecha a mensagem de texto aberta, se houver (antes de eventos de tool). */
function closeOpenText(events: BaseEvent[], input: RunAgentInput, state: AgUIStreamState): void {
  if (state.textOpen) {
    events.push({ type: "TEXT_MESSAGE_END", messageId: currentMsgId(input, state) } as BaseEvent);
    state.textOpen = false;
    state.messageIndex += 1;
  }
}

/**
 * Traduz um chunk do stream do Mastra em eventos AG-UI.
 *
 * Retorna os eventos a emitir (já com o messageId correto). O `state` é
 * mutável entre chunks: abre/fecha mensagens de texto (um novo trecho após
 * uma tool call ganha um novo messageId, como faz o agent-langgraph).
 */
export function mastraChunkToAguiEvents(
  chunk: { type?: string; payload?: Record<string, unknown> },
  input: RunAgentInput,
  state: AgUIStreamState,
): BaseEvent[] {
  const events: BaseEvent[] = [];
  const type = chunk?.type;

  if (!type) return events;

  if (type === "text-start") {
    if (!state.textOpen) {
      const messageId = msgId(input, state);
      state.textOpen = true;
      events.push({
        type: "TEXT_MESSAGE_START",
        messageId,
        role: "assistant",
      } as BaseEvent);
    }
    return events;
  }

  if (type === "text-delta") {
    const text = (chunk.payload?.text as string | undefined) ?? "";
    if (!text) return events;
    if (!state.textOpen) {
      const messageId = msgId(input, state);
      state.textOpen = true;
      events.push({
        type: "TEXT_MESSAGE_START",
        messageId,
        role: "assistant",
      } as BaseEvent);
    }
    const messageId = currentMsgId(input, state);
    events.push({
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: text,
    } as BaseEvent);
    return events;
  }

  if (type === "text-end") {
    // Fecha a mensagem aberta. O messageId é o último emitido.
    if (state.textOpen) {
      events.push({ type: "TEXT_MESSAGE_END", messageId: currentMsgId(input, state) } as BaseEvent);
      state.textOpen = false;
      state.messageIndex += 1;
    }
    return events;
  }

  // Tool calls — chunk types REAIS do @mastra/core 1.64 (verificados com probe
  // no fullStream em 2026-09-07): "tool-call-input-streaming-start",
  // "tool-call-delta", "tool-call" e "tool-result". O handler antigo
  // ("tool-start") mapeava um tipo que deixou de existir no upgrade do Mastra —
  // nenhum TOOL_CALL_* chegava ao consumidor e as tools ficavam invisíveis no
  // canal coworker. O loop de execução roda no lado de quem consome (padrão do
  // OpenBot); para tools client (sem execute) o consumidor executa; para tools
  // server (gateway/skills) o TOOL_CALL_RESULT reporta o resultado.

  // 1) Início do streaming de args de uma tool call.
  if (type === "tool-call-input-streaming-start") {
    const { started } = toolState(state);
    const toolCallId = (chunk.payload?.toolCallId as string) ?? `tc_${crypto.randomUUID()}`;
    const toolName = (chunk.payload?.toolName as string) ?? "tool";
    if (!started.has(toolCallId)) {
      closeOpenText(events, input, state);
      started.set(toolCallId, toolName);
      events.push({ type: "TOOL_CALL_START", toolCallId, toolCallName: toolName } as BaseEvent);
    }
    return events;
  }

  // 2) Delta de args (streaming) — repassado como delta do TOOL_CALL_ARGS.
  if (type === "tool-call-delta") {
    const { started, argsSent } = toolState(state);
    const toolCallId = (chunk.payload?.toolCallId as string) ?? `tc_${crypto.randomUUID()}`;
    const delta = (chunk.payload?.argsTextDelta as string | undefined) ?? "";
    if (!started.has(toolCallId)) {
      closeOpenText(events, input, state);
      started.set(toolCallId, (chunk.payload?.toolName as string) ?? "tool");
      events.push({
        type: "TOOL_CALL_START",
        toolCallId,
        toolCallName: (chunk.payload?.toolName as string) ?? "tool",
      } as BaseEvent);
    }
    if (delta) {
      argsSent.add(toolCallId);
      events.push({ type: "TOOL_CALL_ARGS", toolCallId, delta } as BaseEvent);
    }
    return events;
  }

  // 3) Tool call completa — garante START + ARGS + END (client tools terminam
  // aqui: o run para esperando o resultado do consumidor).
  if (type === "tool-call") {
    const { started, argsSent } = toolState(state);
    const toolCallId = (chunk.payload?.toolCallId as string) ?? `tc_${crypto.randomUUID()}`;
    const toolName = (chunk.payload?.toolName as string) ?? "tool";
    if (!started.has(toolCallId)) {
      closeOpenText(events, input, state);
      started.set(toolCallId, toolName);
      events.push({ type: "TOOL_CALL_START", toolCallId, toolCallName: toolName } as BaseEvent);
    }
    if (!argsSent.has(toolCallId)) {
      const args = chunk.payload?.args;
      let delta = "{}";
      try {
        delta = JSON.stringify(args) ?? "{}";
      } catch {
        delta = "{}";
      }
      events.push({ type: "TOOL_CALL_ARGS", toolCallId, delta } as BaseEvent);
    }
    events.push({ type: "TOOL_CALL_END", toolCallId } as BaseEvent);
    return events;
  }

  // 4) Resultado de tool server-executada (gateway/skills/Composio). Client
  // tools não emitem tool-result no stream (o resultado volta numa próxima
  // request via histórico). Sequência garantida: se o START não saiu (run
  // retomado, histórico, edge), emite START + ARGS + END antes do RESULT.
  if (type === "tool-result") {
    const { started, argsSent } = toolState(state);
    const toolCallId = (chunk.payload?.toolCallId as string) ?? `tc_${crypto.randomUUID()}`;
    const toolName = (chunk.payload?.toolName as string) ?? "tool";
    if (!started.has(toolCallId)) {
      closeOpenText(events, input, state);
      started.set(toolCallId, toolName);
      events.push({ type: "TOOL_CALL_START", toolCallId, toolCallName: toolName } as BaseEvent);
      if (!argsSent.has(toolCallId)) {
        let delta = "{}";
        try {
          delta = JSON.stringify(chunk.payload?.args) ?? "{}";
        } catch {
          delta = "{}";
        }
        events.push({ type: "TOOL_CALL_ARGS", toolCallId, delta } as BaseEvent);
      }
      events.push({ type: "TOOL_CALL_END", toolCallId } as BaseEvent);
    }
    let content = "";
    const result = chunk.payload?.result;
    try {
      content = typeof result === "string" ? result : (JSON.stringify(result) ?? "");
    } catch {
      content = String(result);
    }
    events.push({
      type: "TOOL_CALL_RESULT",
      messageId: currentMsgId(input, state),
      toolCallId,
      content,
      role: "tool",
    } as BaseEvent);
    return events;
  }

  return events;
}

function msgId(input: RunAgentInput, state: AgUIStreamState): string {
  return `msg_${input.runId}_${state.messageIndex}`;
}
function currentMsgId(input: RunAgentInput, state: AgUIStreamState): string {
  // Enquanto aberta, a mensagem é a do índice atual.
  return `msg_${input.runId}_${state.messageIndex}`;
}

export function runStarted(input: RunAgentInput): BaseEvent {
  return { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId } as BaseEvent;
}
export function runFinished(input: RunAgentInput): BaseEvent {
  return { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId } as BaseEvent;
}
export function runError(message: string): BaseEvent {
  return { type: "RUN_ERROR", message } as BaseEvent;
}
