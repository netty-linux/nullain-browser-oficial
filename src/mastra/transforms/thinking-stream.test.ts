import { describe, expect, it } from "vitest";
import { createHarmonyTextSanitizer } from "./thinking-stream";

function sanitize(chunks: string[]) {
  const sanitizer = createHarmonyTextSanitizer();
  return chunks.map((chunk) => sanitizer.push(chunk)).join("") + sanitizer.flush();
}

describe("Harmony text sanitizer", () => {
  it("mantém texto comum intacto", () => {
    expect(sanitize(["Google ", "foi aberto."])).toBe("Google foi aberto.");
  });

  it("remove commentary e cabeçalhos, preservando somente a resposta final", () => {
    expect(
      sanitize([
        "<|channel|>commentary<|message|>We need to respond.<|end|>",
        "<|start|>assistant<|channel|>final<|message|>Google foi aberto.",
      ]),
    ).toBe("Google foi aberto.");
  });

  it("reconhece tokens fragmentados entre chunks", () => {
    expect(
      sanitize([
        "<|chan",
        "nel|>commentary<|mess",
        "age|>internal<|end|><|sta",
        "rt|>assistant<|channel|>fi",
        "nal<|message|>Resposta ",
        "correta.<|end|>",
      ]),
    ).toBe("Resposta correta.");
  });
});
