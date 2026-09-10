import { describe, expect, it } from "vitest";
import { updateComputerToolOutcome } from "./computer-tool-outcome";

describe("computer tool outcome", () => {
  const empty = { actionSucceeded: false, failure: null };

  it("keeps a successful open_site successful when an auxiliary read times out", () => {
    const opened = updateComputerToolOutcome(empty, "nullain_computer_open_site", {
      ok: true,
      url: "https://www.cloudflare.com/",
    });
    expect(
      updateComputerToolOutcome(opened, "nullain_computer_read", {
        ok: false,
        error: "Timeout",
      }),
    ).toEqual({ actionSucceeded: true, failure: null });
  });

  it("preserves the real string error from a failed action", () => {
    expect(
      updateComputerToolOutcome(empty, "nullain_computer_open_site", {
        ok: false,
        error: "SearXNG indisponível",
      }).failure,
    ).toBe("SearXNG indisponível");
  });

  it("clears a failed attempt after a successful retry", () => {
    const failed = updateComputerToolOutcome(empty, "nullain_computer_navigate", {
      ok: false,
      error: "temporary",
    });
    expect(
      updateComputerToolOutcome(failed, "nullain_computer_open_site", {
        ok: true,
        url: "https://example.com/",
      }),
    ).toEqual({ actionSucceeded: true, failure: null });
  });
});
