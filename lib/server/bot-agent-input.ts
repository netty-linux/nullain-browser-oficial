/**
 * Evita duplicar o histórico que já vive na memória Mastra sem descartar a
 * resposta de uma client tool. No primeiro passo entra apenas o último user;
 * nas continuações entram apenas as mensagens posteriores a ele.
 */
export function selectBotAgentInput(messages: unknown[], hasToolContinuation: boolean): unknown[] {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && typeof message === "object" && (message as { role?: unknown }).role === "user") {
      lastUser = index;
      break;
    }
  }
  if (lastUser < 0) return [];
  if (!hasToolContinuation) return [messages[lastUser]];
  return messages.slice(lastUser + 1).map((message) => compactComputerToolMessage(message));
}

export type CompletedComputerToolPart = {
  type: "tool-call";
  version: 1;
  toolName: string;
  toolCallId: string;
  input: unknown;
  output: unknown;
};

const MAX_OBSERVATION_TEXT = 800;
const MAX_COLLECTION_ITEMS = 80;
const MAX_TOOL_RESULTS_IN_CONTEXT = 8;

function isComputerToolName(name: string) {
  return name.startsWith("openbot_computer_") || name.startsWith("nullain_computer_");
}

function isComputerToolPartType(type: string) {
  return type.startsWith("tool-") && isComputerToolName(type.slice(5));
}

function compactComputerValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string")
    return value.length > MAX_OBSERVATION_TEXT
      ? `${value.slice(0, MAX_OBSERVATION_TEXT)}\n…[observação truncada]`
      : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= 6) return "[estrutura truncada]";
  if (Array.isArray(value))
    return value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => compactComputerValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      compactComputerValue(item, depth + 1),
    ]),
  );
}

export function compactComputerToolOutput(output: unknown): unknown {
  return compactComputerValue(output);
}

function compactComputerToolMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const candidate = message as { parts?: unknown[] };
  if (!Array.isArray(candidate.parts)) return message;
  const compacted = candidate.parts.map((value) => {
    if (!value || typeof value !== "object") return value;
    const part = value as Record<string, unknown>;
    return typeof part.type === "string" && isComputerToolPartType(part.type)
      ? { ...part, output: compactComputerToolOutput(part.output) }
      : part;
  });
  let remainingTools = MAX_TOOL_RESULTS_IN_CONTEXT;
  const bounded = compacted.reverse().filter((value) => {
    if (!value || typeof value !== "object") return true;
    const type = (value as { type?: unknown }).type;
    if (typeof type !== "string" || !isComputerToolPartType(type)) return true;
    if (remainingTools <= 0) return false;
    remainingTools -= 1;
    return true;
  });
  return {
    ...candidate,
    parts: bounded.reverse(),
  };
}

/** Considera somente tools posteriores ao último user; histórico antigo não é continuação. */
export function completedComputerToolsAfterLastUser(
  messages: unknown[],
): CompletedComputerToolPart[] {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && typeof message === "object" && (message as { role?: unknown }).role === "user") {
      lastUser = index;
      break;
    }
  }
  if (lastUser < 0) return [];
  const restored: CompletedComputerToolPart[] = [];
  for (const message of messages.slice(lastUser + 1)) {
    if (!message || typeof message !== "object") continue;
    const candidate = message as { role?: unknown; parts?: unknown[] };
    if (candidate.role !== "assistant" || !Array.isArray(candidate.parts)) continue;
    for (const value of candidate.parts) {
      if (!value || typeof value !== "object") continue;
      const part = value as Record<string, unknown>;
      const type = typeof part.type === "string" ? part.type : "";
      const toolName = type.startsWith("tool-") ? type.slice(5) : "";
      if (
        !isComputerToolName(toolName) ||
        part.state !== "output-available" ||
        typeof part.toolCallId !== "string"
      )
        continue;
      restored.push({
        type: "tool-call",
        version: 1,
        toolName,
        toolCallId: part.toolCallId,
        input: part.input,
        output: compactComputerToolOutput(part.output),
      });
    }
  }
  return restored;
}
