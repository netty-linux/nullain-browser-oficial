import { describe, expect, it } from "vitest";
import {
  getLatestUserImageDataUrl,
  hasLatestUserImage,
  pruneMessageHistory,
} from "./chat-message-history";

const png = "data:image/png;base64,AAAA";
const jpeg = "data:image/jpeg;base64,BBBB";

describe("chat message image history", () => {
  it("preserva somente a imagem do turno atual para modelos com visão", () => {
    const messages = [
      { role: "user", parts: [{ type: "file", url: png, mediaType: "image/png" }] },
      { role: "assistant", parts: [{ type: "text", text: "imagem antiga" }] },
      {
        role: "user",
        parts: [
          { type: "text", text: "analise esta" },
          { type: "file", url: jpeg, mediaType: "image/jpeg" },
        ],
      },
    ];

    const result = pruneMessageHistory(messages, { keepLatestUserImages: true });
    expect(result.stats.droppedImageParts).toBe(1);
    expect((result.messages[0] as { parts: unknown[] }).parts).toEqual([
      { type: "text", text: "[imagem anterior omitida]" },
    ]);
    expect((result.messages[2] as { parts: unknown[] }).parts).toHaveLength(2);
  });

  it("reconhece o formato interno do Mastra e remove a imagem quando visão está desligada", () => {
    const messages = [
      {
        role: "user",
        content: {
          parts: [
            { type: "text", text: "olhe" },
            { type: "file", data: png, mimeType: "image/png" },
          ],
        },
      },
    ];

    const result = pruneMessageHistory(messages, { keepLatestUserImages: false });
    expect(result.stats.droppedImageParts).toBe(1);
    expect((result.messages[0] as { content: { parts: unknown[] } }).content.parts).toEqual([
      { type: "text", text: "olhe" },
    ]);
  });

  it("detecta somente imagem suportada na última mensagem do usuário", () => {
    const withImagePart = [
      { role: "user", parts: [{ type: "image", image: png }] },
      { role: "assistant", parts: [{ type: "text", text: "ok" }] },
    ];
    expect(hasLatestUserImage(withImagePart)).toBe(true);
    expect(getLatestUserImageDataUrl(withImagePart)).toBe(png);

    const oldImageOnly = [
      { role: "user", parts: [{ type: "image", image: png }] },
      { role: "assistant", parts: [{ type: "text", text: "ok" }] },
      { role: "user", parts: [{ type: "text", text: "novo turno" }] },
    ];
    expect(hasLatestUserImage(oldImageOnly)).toBe(false);
    expect(getLatestUserImageDataUrl(oldImageOnly)).toBeNull();
  });

  it("descarta formatos não suportados e respostas vazias", () => {
    const messages = [
      {
        role: "user",
        parts: [{ type: "file", url: "data:image/gif;base64,CCCC", mediaType: "image/gif" }],
      },
      { role: "assistant", parts: [] },
    ];

    expect(hasLatestUserImage(messages)).toBe(false);
    const result = pruneMessageHistory(messages, { keepLatestUserImages: false });
    expect(result.stats).toEqual({ droppedImageParts: 1, droppedEmptyAssistant: 1 });
    expect(result.messages).toHaveLength(1);
  });
});
