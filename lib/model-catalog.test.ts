import { describe, expect, it } from "vitest";
import {
  CHAT_MODEL_IDS,
  DEFAULT_VISION_CHAT_MODEL,
  VISION_CHAT_MODEL_IDS,
  isSupportedImageMediaType,
  isVisionChatModel,
  resolveSupportedImageMediaType,
} from "./model-catalog";

describe("model catalog", () => {
  it("mantém os oito modelos visuais dentro do catálogo cloud", () => {
    expect(VISION_CHAT_MODEL_IDS).toHaveLength(8);
    expect(VISION_CHAT_MODEL_IDS).toEqual([
      "ollama-cloud/glm-5.3-flash",
      "ollama-cloud/gemma4",
      "ollama-cloud/minimax-m3",
      "ollama-cloud/kimi-k2.7-code",
      "ollama-cloud/kimi-k2.6",
      "ollama-cloud/kimi-k3",
      "ollama-cloud/qwen3.5",
      "ollama-cloud/mistral-large-3:675b",
    ]);
    expect(VISION_CHAT_MODEL_IDS.every((model) => CHAT_MODEL_IDS.includes(model))).toBe(true);
    expect(isVisionChatModel(DEFAULT_VISION_CHAT_MODEL)).toBe(true);
    expect(isVisionChatModel("ollama-cloud/gpt-oss:20b")).toBe(false);
  });

  it("aceita somente PNG, JPEG e WebP", () => {
    expect(isSupportedImageMediaType("image/png")).toBe(true);
    expect(isSupportedImageMediaType("image/jpeg; charset=binary")).toBe(true);
    expect(isSupportedImageMediaType("image/webp")).toBe(true);
    expect(isSupportedImageMediaType("image/gif")).toBe(false);
    expect(isSupportedImageMediaType(undefined)).toBe(false);
    expect(resolveSupportedImageMediaType({ name: "foto.JPG", type: "" })).toBe("image/jpeg");
    expect(
      resolveSupportedImageMediaType({ name: "foto.webp", type: "application/octet-stream" }),
    ).toBe("image/webp");
    expect(resolveSupportedImageMediaType({ name: "animacao.gif", type: "image/gif" })).toBeNull();
  });
});
