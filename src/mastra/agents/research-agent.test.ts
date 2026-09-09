import { describe, expect, it } from "vitest";
import { researchAgent } from "./research-agent";
async function defaultClientTools(): Promise<Record<string, unknown>> {
  const defaults = await (
    researchAgent as unknown as {
      getDefaultOptions: (ctx?: unknown) => Promise<Record<string, unknown> | undefined>;
    }
  ).getDefaultOptions({});
  return (defaults?.clientTools as Record<string, unknown>) ?? {};
}

describe("researchAgent — ferramentas governadas pelo runtime", () => {
  it("não mantém client tools globais sem escopo", async () => {
    expect(await defaultClientTools()).toEqual({});
  });

  it("não referencia o provider legado OpenBot", async () => {
    const description = await researchAgent.getDescription();
    const instructions = await researchAgent.getInstructions();
    expect(`${description}\n${instructions}`).not.toContain("openbot_");
    expect(`${description}\n${instructions}`).toContain("runtime");
  });
});
