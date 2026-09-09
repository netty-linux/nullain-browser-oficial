import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  mergeBotTranscriptMessages,
  readBotTranscript,
  resolveTranscriptTarget,
  toBotTranscriptRepository,
} from "./bot-transcript-history";

const message = (id: string, sequence: number): UIMessage => ({
  id,
  role: sequence % 2 ? "user" : "assistant",
  parts: [{ type: "text", text: id }],
  metadata: { nullainSequence: sequence },
});

describe("bot transcript hydration", () => {
  it("deduplica a resolução concorrente da mesma conversa", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ conversation: { id: "canonical-conversation" } }), {
        status: 200,
      });
    };
    const selection = {
      botId: `bot-${crypto.randomUUID()}`,
      clientConversationId: crypto.randomUUID(),
    };
    try {
      const [first, second] = await Promise.all([
        resolveTranscriptTarget(selection),
        resolveTranscriptTarget(selection),
      ]);
      expect(first).toEqual(second);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("converte mensagens na cadeia exigida pelo assistant-ui", () => {
    expect(toBotTranscriptRepository([message("m1", 1), message("m2", 2)])).toEqual({
      headId: "m2",
      messages: [
        { parentId: null, message: message("m1", 1) },
        { parentId: "m1", message: message("m2", 2) },
      ],
    });
  });

  it("mescla páginas e atualizações sem duplicar mensagens", () => {
    expect(
      mergeBotTranscriptMessages(
        [message("m2", 2), message("m3", 3)],
        [message("m1", 1), message("m2", 2)],
      ).map((item) => item.id),
    ).toEqual(["m1", "m2", "m3"]);
  });

  it("restaura tool calls persistidas no formato do AI SDK", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              status: "completed",
              sequence: 2,
              publicError: null,
              parts: [
                {
                  type: "tool-call",
                  version: 1,
                  toolName: "openbot_computer_navigate",
                  toolCallId: "call-1",
                  input: { url: "https://example.com" },
                  output: { url: "https://example.com", title: "Example" },
                },
                { type: "text", text: "Pronto." },
              ],
            },
          ],
          activeRun: null,
        }),
      );
    try {
      const transcript = await readBotTranscript({
        botId: "bot-1",
        clientConversationId: "client-1",
        conversationId: "conversation-1",
      });
      expect(transcript.messages[0]?.parts[0]).toMatchObject({
        type: "tool-openbot_computer_navigate",
        toolCallId: "call-1",
        state: "output-available",
      });
      expect(transcript.messages[0]?.parts.slice(1)).toEqual([
        { type: "step-start" },
        { type: "text", text: "Pronto." },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
