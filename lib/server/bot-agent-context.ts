import "server-only";
import type { TranscriptMessage } from "./bot-transcript-repository";

/** Converte o transcript canônico em contexto textual seguro para o modelo. */
export function buildBotTextContext(
  messages: readonly TranscriptMessage[],
  excludeMessageId?: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const candidates = messages
    .filter(
      (message) =>
        message.id !== excludeMessageId &&
        (message.status === "completed" || message.status === "failed"),
    )
    .map((message) => ({
      role: message.role,
      content: message.parts
        .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
          Boolean(part.type === "text" && part.text.trim()),
        )
        .map((part) => part.text)
        .join("\n"),
    }))
    .filter((message) => message.content.length > 0);
  let remaining = 12_000;
  const selected: typeof candidates = [];
  for (const message of candidates.reverse()) {
    if (remaining <= 0) break;
    const content = message.content.slice(0, Math.min(4_000, remaining));
    if (content) {
      selected.push({ ...message, content });
      remaining -= content.length;
    }
  }
  return selected.reverse();
}
