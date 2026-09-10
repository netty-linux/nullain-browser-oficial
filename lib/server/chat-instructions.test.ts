import { describe, expect, it } from "vitest";
import { buildChatInstructions } from "./chat-instructions";

function instructions(useLocalComputer: boolean, computer = useLocalComputer) {
  return buildChatInstructions({
    botRuntime: null,
    computer,
    useLocalComputer,
    integrationsAvailable: false,
  });
}

describe("computer chat instructions", () => {
  it("requires real navigation and verification before reporting success", () => {
    const value = instructions(true);

    expect(value).toContain("execute nullain_computer_open_site com o nome informado");
    expect(value).toContain("ok=true");
    expect(value).toContain("nullain_computer_read");
    expect(value).toContain("responda sem uma segunda leitura");
    expect(value).toContain("não diga que abriu");
  });

  it("resolves named sites server-side and refuses ambiguous results", () => {
    const value = instructions(true);

    expect(value).toContain("resolve e valida a homepage oficial no servidor");
    expect(value).toContain("Se open_site apontar ambiguidade");
    expect(value).toContain("nunca invente o domínio");
  });

  it("treats follow-up commands as actions and preserves the user's goal", () => {
    const value = instructions(true);

    expect(value).toContain('"continue" usando a página atual');
    expect(value).toContain("continue autonomamente pelos passos intermediários");
    expect(value).toContain("componha um prompt adequado ao objetivo descrito");
    expect(value).toContain("Não devolva instruções para o usuário executar manualmente");
  });

  it("requires a fresh observe-act-verify cycle for every interaction", () => {
    const value = instructions(true);

    expect(value).toContain("Antes de CADA clique ou preenchimento");
    expect(value).toContain("Execute UMA ação de interface por vez");
    expect(value).toContain("snapshot expirado ou referência inválida");
    expect(value).toContain("o estado final pedido");
  });

  it("forbids simulated navigation when the requested computer is unavailable", () => {
    expect(instructions(false, true)).toContain(
      "Não simule navegação nem afirme ter aberto uma página",
    );
  });
});
