import { describe, expect, it } from "vitest";
import { matchesThreadTitle } from "./thread-search";

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
});
