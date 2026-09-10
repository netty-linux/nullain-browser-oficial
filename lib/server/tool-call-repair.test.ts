import { describe, expect, it } from "vitest";
import {
  repairMalformedToolCall,
  recoverEmptyComputerInput,
  stripTrailingEmptyJsonObjects,
} from "./tool-call-repair";

describe("tool call repair", () => {
  it("keeps the first complete object when the provider appends empty objects", async () => {
    const malformed = '{"url":"https://www.netflix.com"}{}{\n}';

    expect(stripTrailingEmptyJsonObjects(malformed)).toBe('{"url":"https://www.netflix.com"}');
    await expect(
      repairMalformedToolCall({
        toolCall: {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "nullain_computer_navigate",
          input: malformed,
        },
      }),
    ).resolves.toMatchObject({
      toolCallId: "call-1",
      toolName: "nullain_computer_navigate",
      input: '{"url":"https://www.netflix.com"}',
    });
  });

  it.each([
    '{"url":',
    '{"url":"https://example.com"}garbage',
    '{}{"url":"https://example.com"}',
    '[{"url":"https://example.com"}]{}',
  ])("refuses unrelated malformed input: %s", (input) => {
    expect(stripTrailingEmptyJsonObjects(input)).toBeNull();
  });

  it("handles braces and escaped quotes inside JSON strings", () => {
    expect(stripTrailingEmptyJsonObjects('{"text":"a } \\\"quoted\\\" value"}{}')).toBe(
      '{"text":"a } \\\"quoted\\\" value"}',
    );
  });

  it("recovers an empty navigation input from one unambiguous site name", async () => {
    await expect(
      repairMalformedToolCall({
        toolCall: {
          type: "tool-call",
          toolCallId: "call-github",
          toolName: "nullain_computer_navigate",
          input: "{}",
        },
        messages: [{ role: "user", content: [{ type: "text", text: "Abra o GitHub" }] }],
      }),
    ).resolves.toMatchObject({
      toolName: "nullain_computer_open_site",
      input: '{"site":"Abra o GitHub"}',
    });
  });

  it("routes any named site through the semantic resolver without a manual list", async () => {
    await expect(
      repairMalformedToolCall({
        toolCall: {
          type: "tool-call",
          toolCallId: "call-cloudflare",
          toolName: "nullain_computer_navigate",
          input: "{}",
        },
        messages: [{ role: "user", content: "abra o site da cloudflare" }],
      }),
    ).resolves.toMatchObject({
      toolName: "nullain_computer_open_site",
      input: '{"site":"abra o site da cloudflare"}',
    });
  });

  it("never converts an empty non-navigation tool into open_site", async () => {
    await expect(
      repairMalformedToolCall({
        toolCall: {
          type: "tool-call",
          toolCallId: "call-read",
          toolName: "nullain_computer_read",
          input: "{}",
        },
        messages: [{ role: "user", content: "Abra o GitHub" }],
      }),
    ).resolves.toBeNull();
  });

  it("recovers empty type arguments only with one safe visible field", () => {
    expect(
      recoverEmptyComputerInput({
        toolName: "nullain_computer_type",
        messages: [
          {
            role: "user",
            content: "Gere uma imagem 9:16 estilo UGC de uma mulher vendendo chocolate",
          },
        ],
        snapshotId: 14,
        elements: [
          { ref: "search", tag: "input", type: "search", name: "Search chats" },
          { ref: "composer", tag: "textarea", type: "textarea", name: "Ask anything" },
        ],
      }),
    ).toEqual({
      ref: "composer",
      snapshotId: 14,
      text: "Gere uma imagem 9:16 estilo UGC de uma mulher vendendo chocolate",
      submit: true,
    });
  });

  it("refuses to choose between multiple writable fields", () => {
    expect(
      recoverEmptyComputerInput({
        toolName: "nullain_computer_type",
        messages: [{ role: "user", content: "Preencha o formulário" }],
        snapshotId: 3,
        elements: [
          { ref: "first", tag: "input", type: "text", name: "First name" },
          { ref: "last", tag: "input", type: "text", name: "Last name" },
        ],
      }),
    ).toBeNull();
  });

  it("recovers an empty click only for one exactly mentioned control", () => {
    expect(
      recoverEmptyComputerInput({
        toolName: "nullain_computer_click",
        messages: [{ role: "user", content: "Clique no botão azul escrito Continue" }],
        snapshotId: 8,
        elements: [
          { ref: "next", tag: "button", type: "button", name: "Continue" },
          { ref: "back", tag: "button", type: "button", name: "Back" },
        ],
      }),
    ).toEqual({ ref: "next", snapshotId: 8 });
  });
});
