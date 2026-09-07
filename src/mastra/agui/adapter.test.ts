import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";
import { mastraChunkToAguiEvents, translateMessages, type AgUIStreamState } from "./adapter";

/**
 * Testes com os chunk shapes REAIS do @mastra/core 1.64 (capturados com probe
 * no fullStream em 2026-09-07). O handler antigo ("tool-start") mapeava um
 * tipo que não existe mais — nenhum TOOL_CALL_* chegava ao OpenBot.
 */
function makeInput(): RunAgentInput {
  return {
    threadId: "t1",
    runId: "r1",
    messages: [],
  } as unknown as RunAgentInput;
}

function makeState(): AgUIStreamState {
  return { textOpen: false, messageIndex: 0 };
}

describe("adapter AG-UI — tool calls (chunk types do Mastra 1.64)", () => {
  it("sequência streaming: START único, ARGS com os deltas, END", () => {
    const input = makeInput();
    const state = makeState();
    const ev = (t: string, payload: Record<string, unknown>) =>
      mastraChunkToAguiEvents({ type: t, payload }, input, state);

    const a = ev("tool-call-input-streaming-start", {
      toolCallId: "tc1",
      toolName: "openbot_computer_navigate",
    });
    const b = ev("tool-call-delta", {
      toolCallId: "tc1",
      toolName: "openbot_computer_navigate",
      argsTextDelta: '{"url":"https://ex',
    });
    const c = ev("tool-call-delta", {
      toolCallId: "tc1",
      toolName: "openbot_computer_navigate",
      argsTextDelta: 'ample.com"}',
    });
    const d = ev("tool-call", {
      toolCallId: "tc1",
      toolName: "openbot_computer_navigate",
      args: { url: "https://example.com" },
    });

    const events = [...a, ...b, ...c, ...d];
    expect(events.filter((e) => e.type === "TOOL_CALL_START")).toHaveLength(1);
    expect(events.some((e) => e.type === "TOOL_CALL_END")).toBe(true);
    const args = events
      .filter((e) => e.type === "TOOL_CALL_ARGS")
      .map((e) => (e as unknown as { delta: string }).delta)
      .join("");
    expect(args).toBe('{"url":"https://example.com"}');
    // tool-call completo não duplica os args já enviados via delta.
    expect(events.filter((e) => e.type === "TOOL_CALL_ARGS")).toHaveLength(2);
    const start = events.find((e) => e.type === "TOOL_CALL_START") as unknown as {
      toolCallName: string;
    };
    expect(start.toolCallName).toBe("openbot_computer_navigate");
  });

  it("tool-call sem streaming (client tool): START + ARGS completos + END", () => {
    const events = mastraChunkToAguiEvents(
      {
        type: "tool-call",
        payload: {
          toolCallId: "tc2",
          toolName: "openbot_computer_click",
          args: { ref: "f1", snapshotId: 3 },
        },
      },
      makeInput(),
      makeState(),
    );
    expect(events.map((e) => e.type)).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
    ]);
    const args = events.find((e) => e.type === "TOOL_CALL_ARGS") as unknown as { delta: string };
    expect(JSON.parse(args.delta)).toEqual({ ref: "f1", snapshotId: 3 });
  });

  it("tool-result server-executado sem START prévio: sequência completa + RESULT", () => {
    const events = mastraChunkToAguiEvents(
      {
        type: "tool-result",
        payload: {
          toolCallId: "tc3",
          toolName: "load_skill",
          args: { name: "commit-writer" },
          result: { ok: true, body: "skill carregada" },
        },
      },
      makeInput(),
      makeState(),
    );
    expect(events.map((e) => e.type)).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
    ]);
    const result = events.find((e) => e.type === "TOOL_CALL_RESULT") as unknown as {
      toolCallId: string;
      content: string;
      role: string;
      messageId: string;
    };
    expect(result.toolCallId).toBe("tc3");
    expect(result.role).toBe("tool");
    expect(JSON.parse(result.content)).toEqual({ ok: true, body: "skill carregada" });
    expect(result.messageId).toBe("msg_r1_0");
  });

  it("fecha a mensagem de texto aberta antes do TOOL_CALL_START e avança o índice", () => {
    const input = makeInput();
    const state = makeState();
    state.textOpen = true;
    const events = mastraChunkToAguiEvents(
      {
        type: "tool-call-input-streaming-start",
        payload: { toolCallId: "tc4", toolName: "openbot_computer_read" },
      },
      input,
      state,
    );
    expect(events.map((e) => e.type)).toEqual(["TEXT_MESSAGE_END", "TOOL_CALL_START"]);
    expect(state.textOpen).toBe(false);
    expect(state.messageIndex).toBe(1);
  });

  it("texto após a tool call abre nova mensagem (índice intacto sem texto fechado)", () => {
    const input = makeInput();
    const state = makeState();
    mastraChunkToAguiEvents(
      {
        type: "tool-call",
        payload: { toolCallId: "tc5", toolName: "openbot_computer_scroll", args: {} },
      },
      input,
      state,
    );
    const after = mastraChunkToAguiEvents(
      { type: "text-delta", payload: { text: "pronto" } },
      input,
      state,
    );
    expect(after.some((e) => e.type === "TEXT_MESSAGE_START")).toBe(true);
    const content = after.find((e) => e.type === "TEXT_MESSAGE_CONTENT") as unknown as {
      messageId: string;
    };
    // Sem texto aberto antes da tool call, nada foi fechado — o índice segue 0.
    expect(content.messageId).toBe("msg_r1_0");
  });

  it("tipo legado 'tool-start' (não existe mais no Mastra 1.64) não emite eventos", () => {
    const events = mastraChunkToAguiEvents(
      { type: "tool-start", payload: { toolCallId: "tc6", toolName: "x" } },
      makeInput(),
      makeState(),
    );
    expect(events).toEqual([]);
  });
});

describe("adapter AG-UI — translateMessages (regressão)", () => {
  it("mantém roles válidos e preserva toolCallId/toolCalls", () => {
    const input = {
      threadId: "t1",
      runId: "r1",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "oi" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc1", type: "function", function: { name: "f", arguments: "{}" } }],
        },
        { role: "tool", content: "res", toolCallId: "tc1" },
        { role: "alien", content: "x" },
      ],
    } as unknown as RunAgentInput;
    const out = translateMessages(input) as Array<Record<string, unknown>>;
    expect(out).toHaveLength(4);
    expect(out[2]).toMatchObject({ role: "assistant", toolCalls: [{ id: "tc1" }] });
    expect(out[3]).toMatchObject({ role: "tool", toolCallId: "tc1" });
  });
});
