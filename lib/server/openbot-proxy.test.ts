import { describe, expect, it } from "vitest";
import { withoutNullainAuthCookies } from "./openbot-proxy";

describe("OpenBot cookie forwarding", () => {
  it("removes only Nullain Code cookies and preserves OpenBot cookies", () => {
    expect(
      withoutNullainAuthCookies(
        "openbot-session=ok; nullain-code-auth.session_token=secret; __Secure-nullain-code-auth.session_data=cached; preference=dark",
      ),
    ).toBe("openbot-session=ok; preference=dark");
  });
});
