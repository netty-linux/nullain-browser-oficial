import { describe, expect, it } from "vitest";
import { destroyLocalComputer, navigateLocalComputer } from "./local-computer";
import { resolvePublicSite } from "./site-resolver";

const enabled = process.env.NULLAIN_SITE_RESOLVER_INTEGRATION === "1";

describe.runIf(enabled)("local site resolver integration", () => {
  it("resolves a human site name and opens the verified result in the real computer", async () => {
    const scope = {
      ownerUserId: "site-resolver-integration",
      botId: "nullain",
      conversationId: crypto.randomUUID(),
    };
    try {
      const startedAt = performance.now();
      const resolution = await resolvePublicSite("abra o site da Cloudflare", {
        readCache: () => null,
        writeCache: (value) => value,
      });
      expect(resolution).toMatchObject({
        hostname: "www.cloudflare.com",
        source: "searxng",
      });
      const page = await navigateLocalComputer(scope, resolution.canonicalUrl, "open-site-test");
      expect(new URL(page.url).hostname).toBe("www.cloudflare.com");
      expect(performance.now() - startedAt).toBeLessThan(8_000);
    } finally {
      await destroyLocalComputer(scope);
    }
  }, 60_000);
});
