import { describe, expect, it } from "vitest";
import type { TranscriptMessage } from "./bot-transcript-repository";
import { buildBotTextContext } from "./bot-agent-context";

const message = (
  id: string,
  role: "user" | "assistant",
  status: TranscriptMessage["status"],
  parts: TranscriptMessage["parts"],
): TranscriptMessage => ({
  id,
  botConversationId: "conversation",
  role,
  status,
  sequence: 1,
  idempotencyKey: null,
  parts,
  createdAt: 1,
  updatedAt: 1,
  publicError: null,
});

describe("buildBotTextContext", () => {
  it("usa somente texto canônico e ignora tool calls e mensagens pendentes", () => {
    expect(
      buildBotTextContext([
        message("u1", "user", "completed", [{ type: "text", text: "Abra o Google" }]),
        message("a1", "assistant", "completed", [
          {
            type: "tool-call",
            version: 1,
            toolName: "openbot_computer_navigate",
            toolCallId: "call-1",
            input: {},
            output: {},
          },
          { type: "text", text: "Google aberto." },
        ]),
        message("pending", "assistant", "streaming", [{ type: "text", text: "parcial" }]),
      ]),
    ).toEqual([
      { role: "user", content: "Abra o Google" },
      { role: "assistant", content: "Google aberto." },
    ]);
  });

  it("exclui o user atual no primeiro passo para não duplicá-lo", () => {
    const current = message("current", "user", "completed", [
      { type: "text", text: "Digite na busca" },
    ]);
    expect(buildBotTextContext([current], current.id)).toEqual([]);
  });

  it("limita cada mensagem e o contexto textual acumulado", () => {
    const messages = Array.from({ length: 10 }, (_, index) =>
      message(`m${index}`, index % 2 ? "assistant" : "user", "completed", [
        { type: "text", text: String(index).repeat(5_000) },
      ]),
    );
    const context = buildBotTextContext(messages);
    expect(context.reduce((total, item) => total + item.content.length, 0)).toBeLessThanOrEqual(
      12_000,
    );
    expect(context.every((item) => item.content.length <= 4_000)).toBe(true);
    expect(context.at(-1)?.content.startsWith("9")).toBe(true);
  });
});
