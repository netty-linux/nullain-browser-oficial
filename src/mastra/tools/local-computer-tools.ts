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
import { resolvePublicSite, SiteResolutionError } from "@/lib/server/site-resolver";

/**
 * Server-side Computer tools. The browser never chooses the trusted scope.
 *
 * Intencionalmente definidas com `tool()` do AI SDK (não `createTool` do
 * Mastra — verificado em `node_modules/@mastra/core/dist/tools/is-vercel-tool`,
 * o Mastra converte Vercel tools nativamente): o contexto de execução do AI
 * SDK expõe `toolCallId` obrigatório, usado como chave de idempotência nas
 * operações (`navigateLocalComputer(scope, url, toolCallId)`). No
 * `ToolExecutionContext` do Mastra o id vive aninhado e opcional
 * (`context.agent?.toolCallId`), o que quebraria a garantia.
 */
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
    nullain_computer_open_site: tool({
      description:
        "Resolve and open the official homepage of a public site from its human name. Use this instead of navigate when the user names a site without providing an exact URL. Ambiguous matches are refused rather than guessed.",
      inputSchema: z.object({
        site: z.string().trim().min(1).max(200).describe("Site or organization name"),
      }),
      execute: async ({ site }, context) => {
        try {
          const resolution = await resolvePublicSite(site);
          const page = await navigateLocalComputer(
            scope,
            resolution.canonicalUrl,
            context.toolCallId,
          );
          return { ok: true as const, resolution, ...page };
        } catch (error) {
          if (error instanceof SiteResolutionError) {
            return {
              ok: false as const,
              error: error.message,
              code: error.code,
              candidates: error.candidates.map(({ hostname, title, url }) => ({
                hostname,
                title,
                url,
              })),
            };
          }
          return {
            ok: false as const,
            error: error instanceof Error ? error.message : "Não foi possível abrir o site.",
          };
        }
      },
    }),
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
        "Observe the current page and list its visible, enabled interactive elements with a fresh snapshotId and refs. Call immediately before every click or type; refs from older snapshots are stale.",
      inputSchema: z.object({}),
      execute: async () => safe(() => snapshotLocalComputer(scope)),
    }),
    nullain_computer_read: tool({
      description:
        "Verify the current browser state after an action. Returns the real visible text, title and URL; use it to decide whether the user's requested outcome is complete.",
      inputSchema: z.object({}),
      execute: async () => safe(() => readLocalComputer(scope)),
    }),
    nullain_computer_click: tool({
      description:
        "Click exactly one visible element using a ref and snapshotId from the latest snapshot. After clicking, observe again because all previous refs may be stale.",
      inputSchema: z.object({
        ref: z.string().trim().min(1).max(128),
        snapshotId: z.number().int().nonnegative(),
      }),
      execute: async ({ ref, snapshotId }) =>
        safe(() => clickLocalComputer(scope, ref, snapshotId)),
    }),
    nullain_computer_type: tool({
      description:
        "Fill one visible field using the latest snapshot. Set submit=true only when Enter is the intended submission action, then observe again. Never use this for passwords, authentication codes or payment secrets.",
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
