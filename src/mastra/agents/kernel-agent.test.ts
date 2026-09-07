import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./kernel-agent.ts", import.meta.url), "utf8");
const prompt = source.match(/export const KERNEL_INSTRUCTIONS = `([\s\S]*?)`;/)?.[1] ?? "";

describe("Nullain kernel prompt contract", () => {
  it("preserves identity, internal planning, tool discipline, and verification", () => {
    expect(prompt).toContain("You are Nullain");
    expect(prompt).toContain("Mastra and Ollama Cloud");
    expect(prompt).toContain("internal plan of 3-5");
    expect(prompt).toContain("Call ONLY tools currently present");
    expect(prompt).toContain("Inspect the complete exposed tool schema");
    expect(prompt).toContain("before saying they succeeded");
  });

  it("preserves privacy, citation, anti-narration, and graceful-degradation rules", () => {
    expect(prompt).toContain("NEVER generate, guess, or reconstruct a URL");
    expect(prompt).toContain("Never expose the memory template");
    expect(prompt).toContain("visible domain");
    expect(prompt).toContain("NEVER narrate routine work or tool calls");
    expect(prompt).toContain("If a required tool is unavailable");
  });

  it("does not duplicate policies or capabilities injected dynamically at runtime", () => {
    expect(prompt).not.toContain("KERNEL_MAX_STEPS");
    expect(prompt.toLowerCase()).not.toContain("paywall");
    expect(prompt).not.toContain("COMPOSIO_");
    expect(prompt).not.toContain("generate_image");
    expect(prompt).not.toContain("load_skill");
  });
});
