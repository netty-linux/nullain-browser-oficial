import "server-only";

import { snapshotLocalComputer, type LocalComputerScope } from "@/lib/server/local-computer";

type RepairableToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string;
  [key: string]: unknown;
};

type RepairMessage = {
  role?: unknown;
  content?: unknown;
};

type SnapshotElement = {
  ref: string;
  tag: string;
  role?: string | null;
  name?: string;
  type?: string;
};

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function latestUserMessageText(messages: readonly RepairMessage[]): string {
  const latest = [...messages].reverse().find((message) => message?.role === "user");
  return messageText(latest?.content).trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function recoverEmptyComputerInput({
  toolName,
  messages,
  snapshotId,
  elements,
}: {
  toolName: string;
  messages: readonly RepairMessage[];
  snapshotId: number;
  elements: readonly SnapshotElement[];
}): Record<string, unknown> | null {
  const text = latestUserMessageText(messages);
  if (!text) return null;

  if (toolName === "nullain_computer_type") {
    const fields = elements.filter((element) => {
      const kind = normalizeText(element.type ?? "");
      const name = normalizeText(element.name ?? "");
      if (["password", "file", "search", "hidden"].includes(kind)) return false;
      return (
        element.tag === "textarea" ||
        kind === "textarea" ||
        ["text", "email", "url", "tel", "number"].includes(kind) ||
        /ask|reply|message|prompt|chat|anything|pergunte|digite/.test(name)
      );
    });
    if (fields.length !== 1) return null;
    const submit =
      /\b(envie|enviar|mande|gere|gerar|crie|criar|pesquise|buscar|busque|send|submit|generate|search)\b/i.test(
        normalizeText(text),
      );
    return { ref: fields[0].ref, snapshotId, text, ...(submit ? { submit: true } : {}) };
  }

  if (toolName === "nullain_computer_click") {
    const request = normalizeText(text);
    const matches = elements.filter((element) => {
      const name = normalizeText(element.name ?? "").trim();
      return name.length >= 2 && request.includes(name);
    });
    if (matches.length !== 1) return null;
    return { ref: matches[0].ref, snapshotId };
  }

  return null;
}

/**
 * Some OpenAI-compatible reasoning models occasionally finish a valid JSON
 * tool input and then emit one or more empty `{}` deltas. Repair only that
 * narrowly-defined provider defect; arbitrary malformed input remains rejected.
 */
export function stripTrailingEmptyJsonObjects(input: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (start < 0) {
      if (/\s/.test(character)) continue;
      if (character !== "{") return null;
      start = index;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth < 0) return null;
      if (depth === 0) {
        const candidate = input.slice(start, index + 1);
        const suffix = input.slice(index + 1);
        if (!/^(?:\s*\{\s*\}\s*)+$/.test(suffix)) return null;
        try {
          const parsed = JSON.parse(candidate);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? candidate : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function repairMalformedToolCall({
  toolCall,
  messages = [],
}: {
  toolCall: RepairableToolCall;
  messages?: readonly RepairMessage[];
}): Promise<RepairableToolCall | null> {
  const repairedInput = stripTrailingEmptyJsonObjects(toolCall.input);
  if (repairedInput) return { ...toolCall, input: repairedInput };

  // Some Ollama-compatible streams replace a previously complete argument
  // with a final `{}` chunk. Preserve the user's text, but route named-site
  // navigation through the semantic server-side resolver instead of guessing.
  if (
    toolCall.toolName !== "nullain_computer_navigate" &&
    toolCall.toolName !== "nullain_computer_open_site"
  )
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.input);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (Object.keys(parsed).length !== 0) return null;
  const site = latestUserMessageText(messages);
  return site
    ? { ...toolCall, toolName: "nullain_computer_open_site", input: JSON.stringify({ site }) }
    : null;
}

export function createComputerAwareToolCallRepair(scope: LocalComputerScope) {
  return async (options: { toolCall: RepairableToolCall; messages?: readonly RepairMessage[] }) => {
    const repaired = await repairMalformedToolCall(options);
    if (repaired || options.toolCall.input !== "{}") return repaired;
    if (
      options.toolCall.toolName !== "nullain_computer_type" &&
      options.toolCall.toolName !== "nullain_computer_click"
    ) {
      return null;
    }

    const snapshot = await snapshotLocalComputer(scope);
    const input = recoverEmptyComputerInput({
      toolName: options.toolCall.toolName,
      messages: options.messages ?? [],
      snapshotId: snapshot.snapshotId,
      elements: snapshot.elements,
    });
    return input ? { ...options.toolCall, input: JSON.stringify(input) } : null;
  };
}
