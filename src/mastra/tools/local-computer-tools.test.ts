import { describe, expect, it } from "vitest";
import { createLocalComputerTools } from "./local-computer-tools";

describe("local computer toolset", () => {
  const tools = createLocalComputerTools({
    ownerUserId: "owner",
    botId: "bot",
    conversationId: "conversation",
  });

  it("exposes browser actions including governed tab switching", () => {
    expect(Object.keys(tools).sort()).toEqual(
      [
        "nullain_computer_navigate",
        "nullain_computer_open_site",
        "nullain_computer_snapshot",
        "nullain_computer_read",
        "nullain_computer_click",
        "nullain_computer_type",
        "nullain_computer_key",
        "nullain_computer_scroll",
        "nullain_computer_tabs",
        "nullain_computer_switch_tab",
      ].sort(),
    );
  });

  it("keeps execution on the server instead of exposing client tools", () => {
    for (const computerTool of Object.values(tools)) {
      expect(typeof computerTool.execute).toBe("function");
    }
  });
});
