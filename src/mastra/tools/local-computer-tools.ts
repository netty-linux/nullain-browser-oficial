import { tool } from "ai";
import { z } from "zod";
import {
  clickLocalComputer,
  keyLocalComputer,
  listLocalComputerTabs,
  navigateLocalComputer,
  readLocalComputer,
  scrollLocalComputer,
  snapshotLocalComputer,
  switchLocalComputerTab,
  typeLocalComputer,
  type LocalComputerScope,
} from "@/lib/server/local-computer";

/** Server-side Computer tools. The browser never chooses the trusted scope. */
export function createLocalComputerTools(scope: LocalComputerScope) {
  const safe = async <T extends object>(operation: () => Promise<T>) => {
    try {
      return { ok: true as const, ...(await operation()) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "A ação no computador falhou.",
      };
    }
  };
  return {
    nullain_computer_navigate: tool({
      description:
        "Open a real web page in the local isolated computer. Returns its title and readable text.",
      inputSchema: z.object({
        url: z.string().url().describe("Full HTTP or HTTPS address"),
      }),
      execute: async ({ url }, context) =>
        safe(() => navigateLocalComputer(scope, url, context.toolCallId)),
    }),
    nullain_computer_snapshot: tool({
      description:
        "List interactive elements on the current page. Call this immediately before clicking or typing.",
      inputSchema: z.object({}),
      execute: async () => safe(() => snapshotLocalComputer(scope)),
    }),
    nullain_computer_read: tool({
      description: "Read the current page and return its visible text, title and URL.",
      inputSchema: z.object({}),
      execute: async () => safe(() => readLocalComputer(scope)),
    }),
    nullain_computer_click: tool({
      description: "Click an element using a ref from the latest computer snapshot.",
      inputSchema: z.object({
        ref: z.string().trim().min(1).max(128),
        snapshotId: z.number().int().nonnegative(),
      }),
      execute: async ({ ref, snapshotId }) =>
        safe(() => clickLocalComputer(scope, ref, snapshotId)),
    }),
    nullain_computer_type: tool({
      description:
        "Fill a field using the latest snapshot. Never use this for passwords, authentication codes or payment secrets.",
      inputSchema: z.object({
        ref: z.string().trim().min(1).max(128),
        snapshotId: z.number().int().nonnegative(),
        text: z.string().max(20_000),
        submit: z.boolean().optional(),
      }),
      execute: async ({ ref, snapshotId, text, submit }) =>
        safe(() => typeLocalComputer(scope, ref, snapshotId, text, submit)),
    }),
    nullain_computer_key: tool({
      description: "Press a keyboard key or shortcut in the current page.",
      inputSchema: z.object({ key: z.string().trim().min(1).max(64) }),
      execute: async ({ key }) => safe(() => keyLocalComputer(scope, key)),
    }),
    nullain_computer_scroll: tool({
      description: "Scroll the current page. Positive deltaY moves down; negative moves up.",
      inputSchema: z.object({ deltaY: z.number().min(-10_000).max(10_000).optional() }),
      execute: async ({ deltaY }) => safe(() => scrollLocalComputer(scope, deltaY)),
    }),
    nullain_computer_tabs: tool({
      description: "List open browser tabs and identify the active one.",
      inputSchema: z.object({}),
      execute: async () => safe(async () => ({ tabs: await listLocalComputerTabs(scope) })),
    }),
    nullain_computer_switch_tab: tool({
      description: "Switch to a browser tab by the index returned by nullain_computer_tabs.",
      inputSchema: z.object({ index: z.number().int().nonnegative() }),
      execute: async ({ index }) => safe(() => switchLocalComputerTab(scope, index)),
    }),
  };
}
