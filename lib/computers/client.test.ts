import { describe, expect, it } from "vitest";
import { computerUrl } from "./client";

describe("computerUrl", () => {
  it("inclui o id apenas no proxy legado", () => {
    expect(computerUrl("agent one", "/screenshot")).toBe("/api/computers/agent%20one/screenshot");
  });

  it("não expõe nem duplica o id no proxy governado por bot", () => {
    expect(computerUrl("openbot-secret-id", "/screenshot", "/api/bots/bot-1/computer")).toBe(
      "/api/bots/bot-1/computer/screenshot",
    );
  });
});
