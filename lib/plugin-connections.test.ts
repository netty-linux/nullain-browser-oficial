import { describe, expect, it } from "vitest";
import {
  findConfirmedPluginSlugs,
  findPluginConnectionUrl,
  findRequestedPluginSlugs,
  isPluginConnectionActive,
  normalizePluginSearch,
} from "./plugin-connections";

describe("plugin connection state", () => {
  it("ignores a tool call whose result is still streaming", () => {
    expect(
      findConfirmedPluginSlugs([
        {
          content: [
            {
              type: "tool-call",
              toolName: "COMPOSIO_MANAGE_CONNECTIONS",
              args: { toolkits: [{ name: "github" }] },
              result: undefined,
            },
          ],
        },
      ]).size,
    ).toBe(0);
  });

  it("recognizes an active Composio connection", () => {
    const result = findConfirmedPluginSlugs([
      {
        content: [
          {
            type: "tool-call",
            toolName: "composio_COMPOSIO_MANAGE_CONNECTIONS",
            args: { toolkits: [{ name: "github" }] },
            result: { toolkit: "github", status: "ACTIVE" },
          },
        ],
      },
    ]);
    expect([...result]).toEqual(["github"]);
  });

  it("does not mistake an OAuth redirect for an active connection", () => {
    const result = findConfirmedPluginSlugs([
      {
        content: [
          {
            type: "tool-call",
            toolName: "COMPOSIO_MANAGE_CONNECTIONS",
            args: { toolkits: [{ name: "slack" }] },
            result: { toolkit: "slack", status: "INITIATED", redirect_url: "https://example.test" },
          },
        ],
      },
    ]);
    expect(result.size).toBe(0);
  });

  it("keeps connected toolkits outside the popular catalog", () => {
    const result = findConfirmedPluginSlugs([
      {
        content: [
          {
            type: "tool-call",
            toolName: "COMPOSIO_WAIT_FOR_CONNECTIONS",
            args: { toolkits: ["figma"] },
            result: { status: "CONNECTED" },
          },
        ],
      },
    ]);
    expect([...result]).toEqual(["figma"]);
  });

  it("keeps a pending toolkit as a status-check candidate without marking it active", () => {
    const messages = [
      {
        content: [
          {
            type: "tool-call",
            toolName: "COMPOSIO_MANAGE_CONNECTIONS",
            args: { toolkits: ["github"] },
            result: { status: "INITIATED" },
          },
        ],
      },
    ];
    expect([...findRequestedPluginSlugs(messages)]).toEqual(["github"]);
    expect(findConfirmedPluginSlugs(messages).size).toBe(0);
  });

  it("understands boolean active state returned by the connection service", () => {
    expect(isPluginConnectionActive({ connection: { is_active: true } })).toBe(true);
    expect(isPluginConnectionActive({ message: "GitHub is already connected" })).toBe(true);
    expect(isPluginConnectionActive({ connection: { is_active: false }, status: "PENDING" })).toBe(
      false,
    );
  });

  it("sanitizes arbitrary toolkit searches before they become an internal prompt", () => {
    expect(normalizePluginSearch('  Figma <script>alert("x")</script>  ')).toBe(
      "Figma scriptalertxscript",
    );
  });

  it("extracts an official Connect Link from nested tool output", () => {
    expect(
      findPluginConnectionUrl({
        data: JSON.stringify({ redirect_url: "https://connect.composio.dev/link/ln_abc-123" }),
      }),
    ).toBe("https://connect.composio.dev/link/ln_abc-123");
  });

  it("rejects arbitrary URLs returned by a tool", () => {
    expect(
      findPluginConnectionUrl({ redirect_url: "https://evil.example/link/ln_abc" }),
    ).toBeNull();
    expect(findPluginConnectionUrl({ redirect_url: "javascript:alert(1)" })).toBeNull();
  });
});
