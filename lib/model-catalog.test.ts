import { describe, expect, it } from "vitest";
import {
  CHAT_MODEL_IDS,
  COMPUTER_MODEL_ID,
  DEFAULT_VISION_CHAT_MODEL,
  MODEL_ID_ALIASES,
  VISION_CHAT_MODEL_IDS,
  isSupportedImageMediaType,
  isVisionChatModel,
  resolveModelAlias,
  resolveSelectedModel,
  resolveSupportedImageMediaType,
} from "./model-catalog";

describe("model catalog", () => {
  it("mantém os oito modelos visuais dentro do catálogo cloud", () => {
    expect(VISION_CHAT_MODEL_IDS).toHaveLength(8);
    expect(VISION_CHAT_MODEL_IDS).toEqual([
      "ollama-cloud/glm-5.3-flash",
      "ollama-cloud/gemma4:31b",
      "ollama-cloud/minimax-m3",
      "ollama-cloud/kimi-k2.7-code",
      "ollama-cloud/kimi-k2.6",
      "ollama-cloud/kimi-k3",
      "ollama-cloud/qwen3.5:397b",
      "ollama-cloud/mistral-large-3:675b",
    ]);
    expect(VISION_CHAT_MODEL_IDS.every((model) => CHAT_MODEL_IDS.includes(model))).toBe(true);
    expect(isVisionChatModel(DEFAULT_VISION_CHAT_MODEL)).toBe(true);
    expect(isVisionChatModel("ollama-cloud/gpt-oss:20b")).toBe(false);
  });

  it("migra IDs legados para os canônicos do registry", () => {
    expect(resolveModelAlias("ollama-cloud/deepseek-v4-pro:0813")).toBe(
      "ollama-cloud/deepseek-v4-pro",
    );
    expect(resolveModelAlias("ollama-cloud/qwen3.5")).toBe("ollama-cloud/qwen3.5:397b");
    expect(resolveModelAlias("ollama-cloud/gemma4")).toBe("ollama-cloud/gemma4:31b");
    expect(resolveModelAlias("ollama-cloud/kimi-k3")).toBe("ollama-cloud/kimi-k3");
    expect(
      Object.values(MODEL_ID_ALIASES).every((id) =>
        (CHAT_MODEL_IDS as readonly string[]).includes(id),
      ),
    ).toBe(true);
  });

  it("força GPT-OSS no modo computador e respeita a seleção fora dele", () => {
    expect(COMPUTER_MODEL_ID).toBe("ollama-cloud/gpt-oss:20b");
    expect(resolveSelectedModel({ requestedModel: "ollama-cloud/kimi-k3", computer: true })).toBe(
      "ollama-cloud/gpt-oss:20b",
    );
    expect(resolveSelectedModel({ requestedModel: "ollama-cloud/kimi-k3", computer: false })).toBe(
      "ollama-cloud/kimi-k3",
    );
    expect(
      resolveSelectedModel({ requestedModel: "ollama-cloud/glm-5.3-flash", computer: false }),
    ).toBe("ollama-cloud/glm-5.3-flash");
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
