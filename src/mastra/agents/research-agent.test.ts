import { describe, expect, it } from "vitest";
import { researchAgent } from "./research-agent";
import { openbotComputerClientTools } from "../tools/computer-client-tools";

/**
 * Correção da delegação de client tools (2026-09-07).
 *
 * O @mastra/core 1.64 NÃO forwarda o `clientTools` do route.ts ao sub-agente
 * na delegação — o research rodava com ZERO tools. As `defaultOptions` do
 * sub-agente sobrevivem ao forward (validado com probe: o provider do
 * research passa a receber as 7 `openbot_computer_*`). Este teste fixa o
 * contrato: o researchAgent deve expor o conjunto completo via defaultOptions.
 */
async function defaultClientTools(): Promise<Record<string, unknown>> {
  const defaults = await (
    researchAgent as unknown as {
      getDefaultOptions: (ctx?: unknown) => Promise<Record<string, unknown> | undefined>;
    }
  ).getDefaultOptions({});
  return (defaults?.clientTools as Record<string, unknown>) ?? {};
}

describe("researchAgent — client tools sobrevivem à delegação", () => {
  it("expõe o conjunto completo de client tools via defaultOptions", async () => {
    const tools = await defaultClientTools();
    expect(Object.keys(tools).sort()).toEqual(Object.keys(openbotComputerClientTools).sort());
  });

  it("navegação, snapshot, leitura, clique, digitação, tecla e scroll presentes", async () => {
    const tools = await defaultClientTools();
    expect(Object.keys(tools).sort()).toEqual(
      [
        "openbot_computer_navigate",
        "openbot_computer_snapshot",
        "openbot_computer_read",
        "openbot_computer_click",
        "openbot_computer_type",
        "openbot_computer_key",
        "openbot_computer_scroll",
      ].sort(),
    );
  });

  it("são client tools de verdade (sem execute no servidor)", async () => {
    const tools = await defaultClientTools();
    for (const tool of Object.values(tools)) {
      expect("execute" in (tool as Record<string, unknown>)).toBe(false);
    }
  });
});
