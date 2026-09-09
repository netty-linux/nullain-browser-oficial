import { describe, expect, it } from "vitest";
import { completedComputerToolsAfterLastUser, selectBotAgentInput } from "./bot-agent-input";

describe("selectBotAgentInput", () => {
  const history = [
    { id: "old-user", role: "user" },
    { id: "old-assistant", role: "assistant" },
    { id: "current-user", role: "user" },
    {
      id: "tool-output",
      role: "assistant",
      parts: [
        {
          type: "tool-openbot_computer_navigate",
          state: "output-available",
          toolCallId: "current-call",
          input: { url: "https://example.com" },
          output: { url: "https://example.com" },
        },
      ],
    },
  ];

  it("envia somente o user atual no primeiro passo", () => {
    expect(selectBotAgentInput(history.slice(0, 3), false)).toEqual([history[2]]);
  });

  it("envia somente a continuação da tool sem repetir o user", () => {
    expect(selectBotAgentInput(history, true)).toEqual([history[3]]);
  });

  it("não trata uma tool histórica como continuação de uma pergunta nova", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "abra a wikipedia" }] },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-openbot_computer_navigate",
            state: "output-available",
            toolCallId: "old-call",
            input: {},
            output: {},
          },
        ],
      },
      { role: "user", parts: [{ type: "text", text: "pesquise inteligência artificial" }] },
    ];
    expect(completedComputerToolsAfterLastUser(messages)).toEqual([]);
    expect(selectBotAgentInput(messages, false)).toEqual([messages[2]]);
  });

  it("reconhece o resultado da tool apenas no turno atual", () => {
    expect(completedComputerToolsAfterLastUser(history)).toHaveLength(1);
  });

  it("reconhece e compacta as tools server-side do computador local", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "abra" }] },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-nullain_computer_read",
            state: "output-available",
            toolCallId: "local-call",
            input: {},
            output: { url: "https://example.com", text: "x".repeat(4_000) },
          },
        ],
      },
    ];
    const completed = completedComputerToolsAfterLastUser(messages);
    expect(completed).toHaveLength(1);
    expect(completed[0]?.toolName).toBe("nullain_computer_read");
    expect(JSON.stringify(completed[0]?.output).length).toBeLessThan(1_000);
  });

  it("reduz observações grandes sem remover metadados operacionais", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "abra" }] },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-openbot_computer_snapshot",
            state: "output-available",
            toolCallId: "large-call",
            input: {},
            output: { snapshotId: 42, text: "x".repeat(10_000) },
          },
        ],
      },
    ];
    const selected = selectBotAgentInput(messages, true) as Array<{
      parts: Array<{ output: { snapshotId: number; text: string } }>;
    }>;
    expect(selected[0]?.parts[0]?.output.snapshotId).toBe(42);
    expect(selected[0]?.parts[0]?.output.text.length).toBeLessThan(900);
    const persisted = completedComputerToolsAfterLastUser(messages);
    expect(persisted).toHaveLength(1);
    const persistedOutput = persisted[0]!.output as { snapshotId: number };
    expect(persistedOutput.snapshotId).toBe(42);
    expect(JSON.stringify(persistedOutput).length).toBeLessThan(1_000);
  });
});
