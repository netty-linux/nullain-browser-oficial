import { tool } from "ai";
import { z } from "zod";

/**
 * Tool CLIENT (frontend-executed) de navegação do computador — Inversão FASE 5.
 *
 * Este é um CLIENT TOOL do Mastra: o servidor declara a tool ao modelo e emite
 * a tool-call, mas NÃO a executa (não há `execute`). O browser executa a
 * navegação via proxy local (`/api/computers/<id>/navigate`, que repassa o
 * cookie de sessão ao OpenBot) e devolve o resultado ao modelo via `addResult`
 * no render do assistant-ui.
 *
 * Isso replica o padrão do OpenBot: `computer_navigate` roda no frontend (com
 * o cookie de sessão do navegador), não no servidor. A tela do computador
 * aparece inline no chat (via useAssistantToolUI → ComputerView).
 *
 * Mastra referencia: node_modules/@mastra/core/dist/agent-DSxJoGjY.js:17949
 *   "For client-side tools (no execute function), 'call' is the final state
 *    from the server's perspective."
 */
export const openbotComputerNavigateTool = tool({
  description:
    "Open a web page on your computer so the person can watch. Use this when asked to look at, visit, open or check a website. Returns the page title and its readable text, so answer from what comes back rather than telling the person to go and look.",
  inputSchema: z.object({
    url: z.string().describe("Full web address to open, including https://"),
  }),
  // SEM `execute`: client tool — o browser executa (proxy + cookie de sessão)
  // e devolve o resultado via addResult no render.
});

export const openbotComputerSnapshotTool = tool({
  description:
    "List the interactive elements on the current page. Call this before clicking or typing. Returns opaque element refs and a snapshotId; never invent either value.",
  inputSchema: z.object({}),
});

export const openbotComputerReadTool = tool({
  description:
    "Read the current page as text without navigating. Use this after an interaction to verify what changed and whether the action succeeded.",
  inputSchema: z.object({}),
});

export const openbotComputerClickTool = tool({
  description:
    "Click a button, link, checkbox or other element from the latest computer snapshot. Use exactly the ref and snapshotId returned by that snapshot.",
  inputSchema: z.object({
    ref: z.string().trim().min(1).max(128),
    snapshotId: z.number().int().nonnegative(),
  }),
});

export const openbotComputerTypeTool = tool({
  description:
    "Fill a text field from the latest computer snapshot. Set submit=true only when the form should be submitted with Enter after typing. Never use this for passwords, one-time codes or payment secrets.",
  inputSchema: z.object({
    ref: z.string().trim().min(1).max(128),
    snapshotId: z.number().int().nonnegative(),
    text: z.string().max(20_000),
    submit: z.boolean().optional(),
  }),
});

export const openbotComputerKeyTool = tool({
  description:
    "Press a keyboard key in the browser, such as Enter, Tab, Escape or Control+A. Include ref and snapshotId when targeting a specific element.",
  inputSchema: z.object({
    key: z.string().trim().min(1).max(64),
    ref: z.string().trim().min(1).max(128).optional(),
    snapshotId: z.number().int().nonnegative().optional(),
  }),
});

export const openbotComputerScrollTool = tool({
  description:
    "Scroll the current page vertically. Positive deltaY scrolls down and negative deltaY scrolls up.",
  inputSchema: z.object({
    deltaY: z.number().min(-10_000).max(10_000).optional(),
  }),
});

/** Client tools available only while the user has enabled Computador. */
export const openbotComputerClientTools = {
  openbot_computer_navigate: openbotComputerNavigateTool,
  openbot_computer_snapshot: openbotComputerSnapshotTool,
  openbot_computer_read: openbotComputerReadTool,
  openbot_computer_click: openbotComputerClickTool,
  openbot_computer_type: openbotComputerTypeTool,
  openbot_computer_key: openbotComputerKeyTool,
  openbot_computer_scroll: openbotComputerScrollTool,
};
