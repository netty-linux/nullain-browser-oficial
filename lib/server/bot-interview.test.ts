import { describe, expect, it } from "vitest";
import { isExplicitBotCreationRequest } from "./bot-interview";

describe("bot interview intent", () => {
  it.each([
    "Crie um bot para pesquisar fornecedores",
    "Quero um assistente permanente para acompanhar fornecedores",
  ])("starts only from an explicit creation request: %s", (text) => {
    expect(isExplicitBotCreationRequest(text)).toBe(true);
  });
  it.each([
    "Pesquise fornecedores",
    "Será que preciso de um bot?",
    "Quais bots eu tenho?",
    "Abra meu bot de conteúdo",
    "/commit-writer",
  ])("does not start from a non-creation intent: %s", (text) => {
    expect(isExplicitBotCreationRequest(text)).toBe(false);
  });
});
