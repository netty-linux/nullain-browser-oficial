import { describe, expect, it } from "vitest";
import {
  matchesBotProfile,
  matchesSearchText,
  matchesThreadItem,
  matchesThreadTitle,
} from "./thread-search";

describe("thread search", () => {
  it("encontra títulos ignorando maiúsculas e acentos", () => {
    expect(matchesThreadTitle("Reunião do Projeto", "reuniao")).toBe(true);
    expect(matchesThreadTitle("Planejamento Nullain", "NULLAIN")).toBe(true);
  });

  it("normaliza espaços da busca", () => {
    expect(matchesThreadTitle("Pesquisa sobre agentes", " pesquisa   sobre ")).toBe(true);
  });

  it("usa o título padrão e rejeita buscas vazias", () => {
    expect(matchesThreadTitle(undefined, "nova conversa")).toBe(true);
    expect(matchesThreadTitle("Nullain", "   ")).toBe(false);
  });

  it("rejeita títulos que não correspondem", () => {
    expect(matchesThreadTitle("Calendário da equipe", "GitHub")).toBe(false);
  });

  it("casa bots por nome ou descrição sem acento/caixa", () => {
    expect(
      matchesBotProfile({ name: "Redator", description: "Planeja publicações" }, "redator"),
    ).toBe(true);
    expect(
      matchesBotProfile({ name: "Redator", description: "Planeja publicações" }, "PUBLICACOES"),
    ).toBe(true);
    expect(matchesBotProfile({ name: "Redator", description: "Planeja" }, "video")).toBe(false);
    expect(matchesBotProfile({ name: "Redator" }, "   ")).toBe(false);
  });

  it("casa texto livre da busca", () => {
    expect(matchesSearchText("Geração de imagem", "geracao")).toBe(true);
    expect(matchesSearchText("Geração de imagem", "")).toBe(false);
  });

  it("casa thread pelo conteúdo das mensagens quando o título não casa", () => {
    const thread = {
      title: "Nova conversa",
      messages: [
        { role: "user", content: [{ type: "text", text: "como publicar no Instagram?" }] },
      ],
    };
    expect(matchesThreadItem(thread, "instagram")).toBe(true);
    expect(matchesThreadItem(thread, "github")).toBe(false);
    expect(matchesThreadItem({ title: "Planejamento" }, "planejamento")).toBe(true);
  });
});
