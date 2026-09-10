import { describe, expect, it } from "vitest";
import { createHarmonyTextSanitizer, thinkingExtractor } from "./thinking-stream";

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

type TestChunk = { type: string; payload: Record<string, unknown> };

async function runThinkingTransform(texts: string[]): Promise<string> {
  const stream = thinkingExtractor()() as unknown as TransformStream<TestChunk, TestChunk>;
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const visible: string[] = [];
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.type === "text-delta") visible.push(String(value.payload?.text ?? ""));
    }
  })();
  const base = { runId: "test-run", from: "agent" };
  await writer.write({ ...base, type: "text-start", payload: { id: "t1" } });
  for (const text of texts) {
    await writer.write({ ...base, type: "text-delta", payload: { id: "t1", text } });
  }
  await writer.write({ ...base, type: "text-end", payload: {} });
  await writer.close();
  await pump;
  return visible.join("");
}

describe("bare to=functions pseudo-calls", () => {
  it("remove o caso exato do print (click inventado + commentary)", async () => {
    const visible = await runThinkingTransform([
      'to=functions.nullain_computer_clickjson{"ref":"duck-ai-link","snapshotId":0}commentaryDesculpe, não consegui.',
    ]);
    expect(visible).not.toContain("to=functions");
    expect(visible).not.toContain("duck-ai-link");
    expect(visible).not.toContain("commentaryDesculpe");
    expect(visible).toContain("Desculpe, não consegui.");
  });

  it("remove header fragmentado entre chunks sem vazar metade", async () => {
    const visible = await runThinkingTransform([
      "A página foi aberta. to=functions.nullain_computer_cl",
      'ickjson{"ref":"x","snapshotId":2}commentary e o resto da resposta.',
    ]);
    expect(visible).not.toContain("to=functions");
    expect(visible).toContain("A página foi aberta.");
    expect(visible).toContain("e o resto da resposta.");
  });

  it('remove "assistant to=commentary" colado ao texto', async () => {
    const visible = await runThinkingTransform(["assistant to=commentaryVou abrir a página."]);
    expect(visible).toBe("Vou abrir a página.");
  });

  it("descarta JSON truncado no fim do stream", async () => {
    const visible = await runThinkingTransform(['Resultado ok. to=functions.xjson{"a":']);
    expect(visible).toContain("Resultado ok.");
    expect(visible).not.toContain("to=functions");
  });

  it("consome payload dividido em 3 chunks sem vazar restos", async () => {
    const visible = await runThinkingTransform([
      "Início. to=functions.nullain_computer_clickjson{",
      '"ref":"x","snapshotId":',
      "0}commentary Fim da resposta.",
    ]);
    expect(visible).not.toContain("to=functions");
    expect(visible).not.toContain("snapshotId");
    expect(visible).toContain("Início.");
    expect(visible).toContain("Fim da resposta.");
  });

  it("preserva prosa e JSON legítimos", async () => {
    const visible = await runThinkingTransform([
      'Exemplo: {"ref": "abc"} é um JSON válido. Chame a tool real pelo painel de tools.',
    ]);
    expect(visible).toContain('{"ref": "abc"} é um JSON válido');
  });
});
