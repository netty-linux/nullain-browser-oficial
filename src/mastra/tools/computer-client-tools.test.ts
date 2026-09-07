import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openbotComputerClientTools } from "./computer-client-tools";

function schemaOf(name: keyof typeof openbotComputerClientTools): z.ZodType {
  return openbotComputerClientTools[name].inputSchema as z.ZodType;
}

describe("openbot computer client tools", () => {
  it("exposes the complete interactive browser set", () => {
    expect(Object.keys(openbotComputerClientTools)).toEqual([
      "openbot_computer_navigate",
      "openbot_computer_snapshot",
      "openbot_computer_read",
      "openbot_computer_click",
      "openbot_computer_type",
      "openbot_computer_key",
      "openbot_computer_scroll",
    ]);
  });

  it("accepts governed form filling and submission", () => {
    const result = schemaOf("openbot_computer_type").safeParse({
      ref: "f2e5",
      snapshotId: 6,
      text: "Nullain",
      submit: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects actions without a valid snapshot reference", () => {
    expect(
      schemaOf("openbot_computer_click").safeParse({ ref: "f2e5", snapshotId: -1 }).success,
    ).toBe(false);
    expect(
      schemaOf("openbot_computer_type").safeParse({ snapshotId: 6, text: "Nullain" }).success,
    ).toBe(false);
  });

  it("caps action payloads", () => {
    expect(
      schemaOf("openbot_computer_type").safeParse({
        ref: "f2e5",
        snapshotId: 6,
        text: "x".repeat(20_001),
      }).success,
    ).toBe(false);
    expect(schemaOf("openbot_computer_scroll").safeParse({ deltaY: 10_001 }).success).toBe(false);
  });
});
