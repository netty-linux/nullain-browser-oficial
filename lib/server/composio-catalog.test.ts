import { afterEach, describe, expect, it, vi } from "vitest";
import { getComposioToolkits } from "./composio-catalog";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getComposioToolkits", () => {
  it("usa a chave temporária somente no request ao catálogo", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              slug: "github",
              name: "GitHub",
              auth_schemes: ["oauth2"],
              meta: {
                description: "Source control",
                logo: "https://assets.example.test/github.png",
                categories: [{ id: "developer-tools", name: "Developer Tools" }],
                tools_count: 42,
                triggers_count: 3,
              },
            },
          ],
          next_cursor: null,
          total_items: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", request);

    const result = await getComposioToolkits({ apiKey: "temporary-secret" });

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-api-key": "temporary-secret",
    });
    expect(result.items[0]).toMatchObject({
      slug: "github",
      name: "GitHub",
      logo: "https://assets.example.test/github.png",
      toolsCount: 42,
    });
  });

  it("descarta URLs de logo inseguras", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          items: [{ slug: "unsafe", name: "Unsafe", meta: { logo: "javascript:alert(1)" } }],
          total_items: 1,
        }),
      ),
    );

    const result = await getComposioToolkits({ apiKey: "temporary-secret" });

    expect(result.items[0]?.logo).toBeNull();
  });

  it("carrega o catálogo oficial de logos quando recebe uma chave de conexão", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        github: "https://logos.composio.dev/api/github",
        notion: "https://logos.composio.dev/api/notion",
        slack: "https://logos.composio.dev/api/slack",
      }),
    );
    vi.stubGlobal("fetch", request);

    const result = await getComposioToolkits({ apiKey: "ck_temporary-consumer-key" });

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe("https://logos.composio.dev/api/list");
    expect(result.items.map((item) => item.slug)).toEqual(["github", "notion", "slack"]);
    expect(result.items[0]?.logo).toBe("https://logos.composio.dev/api/github");
  });
});
