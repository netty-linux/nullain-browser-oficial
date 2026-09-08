import { describe, expect, it } from "vitest";
import { createNullainCodeAgent } from "./controller";

describe("Nullain Code agent factory", () => {
  it("keeps explicit workspace undefined, preventing LocalSandbox and execute tools", async () => {
    const agent = createNullainCodeAgent();
    expect(await agent.getWorkspace()).toBeUndefined();
    const tools = await agent.listTools();
    expect(Object.keys(tools)).not.toContain("mastra_workspace_execute_command");
    expect(Object.keys(tools)).not.toContain("execute_command");
  });
});
