import { describe, expect, it, vi } from "vitest";
import { normalizeSiteQuery, resolvePublicSite, SiteResolutionError } from "./site-resolver";

const noCache = () => null;
const validateUrl = async (value: unknown) => new URL(String(value)).href;

function searchResponse(results: Array<{ url: string; title: string; content?: string }>) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("site resolver", () => {
  it.each([
    ["abra o site da Cloudflare", "cloudflare"],
    ["Por favor, acesse a página do GitHub", "github"],
    ["open the Figma website", "figma"],
  ])("normalizes a conversational site request", (input, expected) => {
    expect(normalizeSiteQuery(input)).toBe(expected);
  });

  it("resolves a strong official result and writes a reusable cache entry", async () => {
    const writeCache = vi.fn();
    const fetcher = searchResponse([
      {
        url: "https://www.cloudflare.com/",
        title: "Cloudflare - Web Performance & Security",
      },
      { url: "https://en.wikipedia.org/wiki/Cloudflare", title: "Cloudflare - Wikipedia" },
    ]);
    const result = await resolvePublicSite("abra o site da Cloudflare", {
      fetcher,
      readCache: noCache,
      writeCache,
      validateUrl,
    });
    expect(result).toMatchObject({
      canonicalUrl: "https://www.cloudflare.com/",
      hostname: "www.cloudflare.com",
      source: "searxng",
    });
    expect(writeCache).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("uses a fresh cache result without contacting SearXNG", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await resolvePublicSite("Cloudflare", {
      fetcher,
      readCache: () => ({
        queryKey: "cloudflare",
        query: "cloudflare",
        canonicalUrl: "https://www.cloudflare.com/",
        hostname: "www.cloudflare.com",
        confidence: 0.98,
        source: "searxng",
        verifiedAt: 1,
        expiresAt: Date.now() + 60_000,
      }),
      validateUrl,
    });
    expect(result.source).toBe("cache");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves an exact URL embedded in a repaired conversational request", async () => {
    const result = await resolvePublicSite("Abra https://example.com/docs/start", {
      readCache: noCache,
      validateUrl,
    });
    expect(result).toMatchObject({
      canonicalUrl: "https://example.com/docs/start",
      source: "url",
    });
  });

  it("refuses close ambiguous candidates instead of guessing", async () => {
    const fetcher = searchResponse([
      { url: "https://acme.com/", title: "Acme" },
      { url: "https://acme.org/", title: "Acme" },
    ]);
    await expect(
      resolvePublicSite("Acme", { fetcher, readCache: noCache, validateUrl }),
    ).rejects.toMatchObject({ code: "ambiguous" } satisfies Partial<SiteResolutionError>);
  });

  it("reports an unavailable local resolver without inventing a domain", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(
      resolvePublicSite("empresa desconhecida", { fetcher, readCache: noCache, validateUrl }),
    ).rejects.toMatchObject({ code: "unavailable" } satisfies Partial<SiteResolutionError>);
  });
});
