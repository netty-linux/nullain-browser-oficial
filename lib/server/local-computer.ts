import "server-only";

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const DEFAULT_ENDPOINT = "ws://127.0.0.1:3101";
const MAX_READ_CHARS = 24_000;
const MAX_SCOPES = 12;
const IDLE_TTL_MS = 30 * 60 * 1000;

type LocalComputerSession = {
  context: BrowserContext;
  page: Page;
  snapshotId: number;
  refs: Map<string, string>;
  touchedAt: number;
  control: "assistant" | "human";
  frames: Map<string, { url: string; title: string | null; frame: string }>;
  lastFrame?: { frame: string; url: string; capturedAt: string };
  marker: string;
};

type LocalComputerGlobals = typeof globalThis & {
  __nullainLocalComputerBrowser?: Promise<Browser>;
  __nullainLocalComputerSessions?: Map<string, LocalComputerSession>;
  __nullainLocalComputerDnsPolicy?: Map<string, { allowed: boolean; expiresAt: number }>;
};

export type LocalComputerScope = {
  ownerUserId: string;
  botId: string;
  conversationId: string;
};

function globals() {
  return globalThis as LocalComputerGlobals;
}

function endpoint() {
  return process.env.NULLAIN_LOCAL_COMPUTER_CDP_URL?.trim() || DEFAULT_ENDPOINT;
}

export function isLocalComputerEnabled() {
  return process.env.NULLAIN_LOCAL_COMPUTER !== "0";
}

export function localComputerScopeKey(scope: LocalComputerScope) {
  return `${scope.ownerUserId}:${scope.botId}:${scope.conversationId}`;
}

async function browser(): Promise<Browser> {
  if (!isLocalComputerEnabled()) throw new Error("Computador local desativado.");
  const state = globals();
  if (state.__nullainLocalComputerBrowser) {
    const existing = await state.__nullainLocalComputerBrowser.catch(() => null);
    if (existing?.isConnected()) return existing;
    delete state.__nullainLocalComputerBrowser;
    state.__nullainLocalComputerSessions?.clear();
  }
  if (!state.__nullainLocalComputerBrowser) {
    state.__nullainLocalComputerBrowser = chromium
      .connectOverCDP(endpoint(), { timeout: 10_000 })
      .then(async (connected) => {
        // O browser é dedicado à Nullain. Hot reloads/reinícios do Next perdiam o
        // mapa em memória, mas deixavam contextos Chromium órfãos no container.
        // Mantenha apenas o limite mais recente também no processo remoto.
        const contexts = connected.contexts();
        const excess = Math.max(0, contexts.length - MAX_SCOPES);
        for (const context of contexts.slice(0, excess)) {
          await context.close().catch(() => undefined);
        }
        return connected;
      })
      .catch((error) => {
        delete state.__nullainLocalComputerBrowser;
        throw new Error(
          `O runtime local do computador não está acessível em ${endpoint()}. ${error instanceof Error ? error.message : ""}`.trim(),
        );
      });
  }
  return state.__nullainLocalComputerBrowser;
}

function scopeMarker(scope: LocalComputerScope) {
  return `nullain:${createHash("sha256").update(localComputerScopeKey(scope)).digest("hex")}`;
}

async function networkUrlAllowed(url: URL) {
  if (!networkHostAllowed(url.hostname)) return false;
  if (process.env.NULLAIN_LOCAL_COMPUTER_ALLOW_PRIVATE_NETWORK === "1") return true;
  const cache =
    globals().__nullainLocalComputerDnsPolicy ??
    (globals().__nullainLocalComputerDnsPolicy = new Map());
  const cached = cache.get(url.hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    const allowed =
      addresses.length > 0 && addresses.every(({ address }) => networkHostAllowed(address));
    cache.set(url.hostname, { allowed, expiresAt: Date.now() + 5 * 60_000 });
    return allowed;
  } catch {
    cache.set(url.hostname, { allowed: false, expiresAt: Date.now() + 10_000 });
    return false;
  }
}

async function secureContext(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    let requested: URL;
    try {
      requested = new URL(route.request().url());
    } catch {
      await route.abort("blockedbyclient");
      return;
    }
    if (
      (requested.protocol === "http:" || requested.protocol === "https:") &&
      !(await networkUrlAllowed(requested))
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

function sessions() {
  const state = globals();
  state.__nullainLocalComputerSessions ??= new Map();
  return state.__nullainLocalComputerSessions;
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pruneSessions(exceptKey: string) {
  const all = sessions();
  const now = Date.now();
  for (const [key, session] of all) {
    if (key !== exceptKey && now - session.touchedAt > IDLE_TTL_MS) {
      all.delete(key);
      await session.context.close().catch(() => undefined);
    }
  }
  while (all.size >= MAX_SCOPES) {
    const oldest = [...all.entries()]
      .filter(([key]) => key !== exceptKey)
      .sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0];
    if (!oldest) break;
    all.delete(oldest[0]);
    await oldest[1].context.close().catch(() => undefined);
  }
}

async function createSession(scope: LocalComputerScope): Promise<LocalComputerSession> {
  const connected = await browser();
  const context = await connected.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  const marker = scopeMarker(scope);
  await context.addInitScript((scopeValue) => {
    Object.defineProperty(globalThis, "__nullainScopeMarker", {
      value: scopeValue,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }, marker);
  await secureContext(context);
  const page = await context.newPage();
  await page.evaluate((marker) => {
    window.name = marker;
  }, marker);
  return {
    context,
    page,
    snapshotId: 0,
    refs: new Map(),
    touchedAt: Date.now(),
    control: "assistant",
    frames: new Map(),
    marker,
  };
}

async function reconnectSession(scope: LocalComputerScope): Promise<LocalComputerSession | null> {
  const connected = await browser();
  const marker = scopeMarker(scope);
  const contexts = [...connected.contexts()].reverse();
  for (const context of contexts) {
    const pages = [...context.pages()].reverse().sort((left, right) => {
      return Number(left.url() === "about:blank") - Number(right.url() === "about:blank");
    });
    for (const page of pages) {
      if (page.isClosed()) continue;
      const pageMarker = await settleWithin(
        page
          .evaluate(() => (globalThis as { __nullainScopeMarker?: string }).__nullainScopeMarker)
          .catch(() => undefined),
        1_500,
      );
      if (pageMarker !== marker) continue;
      await secureContext(context);
      return {
        context,
        page,
        snapshotId: 0,
        refs: new Map(),
        touchedAt: Date.now(),
        control: "assistant",
        frames: new Map(),
        marker,
      };
    }
  }
  return null;
}

export async function getLocalComputer(scope: LocalComputerScope) {
  const key = localComputerScopeKey(scope);
  await pruneSessions(key);
  let session = sessions().get(key);
  if (!session || session.page.isClosed()) {
    session = (await reconnectSession(scope)) ?? (await createSession(scope));
    sessions().set(key, session);
  }
  session.touchedAt = Date.now();
  return session;
}

function assertAssistantControl(session: LocalComputerSession) {
  if (session.control !== "assistant") {
    throw new Error("O usuário está controlando o computador. Aguarde a devolução do controle.");
  }
}

export async function validatePublicComputerUrl(value: unknown): Promise<string> {
  if (typeof value !== "string" || value.length > 4_096) throw new Error("URL inválida.");
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Somente URLs HTTP e HTTPS são permitidas.");
  }
  if (!(await networkUrlAllowed(parsed))) {
    throw new Error("Endereços locais e redes privadas não são permitidos no computador.");
  }
  return parsed.toString();
}

export function networkHostAllowed(hostname: string): boolean {
  if (process.env.NULLAIN_LOCAL_COMPUTER_ALLOW_PRIVATE_NETWORK === "1") return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return false;
  if (host.startsWith("127.") || host.startsWith("169.254.") || host.startsWith("0.")) {
    return false;
  }
  if (host.startsWith("10.") || host.startsWith("192.168.")) return false;
  if (host.startsWith("100.64.") || host.startsWith("198.18.") || host.startsWith("198.19.")) {
    return false;
  }
  const firstOctet = Number(host.split(".")[0]);
  if (Number.isInteger(firstOctet) && firstOctet >= 224) return false;
  const match = /^172\.(\d+)\./.exec(host);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
  if (
    host === "::" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:192.168.")
  ) {
    return false;
  }
  return true;
}

async function pageSummary(
  page: Page,
  options: { maxChars?: number; textTimeoutMs?: number } = {},
) {
  const maxChars = options.maxChars ?? MAX_READ_CHARS;
  const text = (
    await page
      .locator("body")
      .innerText({ timeout: options.textTimeoutMs ?? 10_000 })
      .catch(() => "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxChars);
  return {
    url: page.url(),
    title: (await page.title().catch(() => "")) || null,
    text,
    truncated: text.length === maxChars,
  };
}

async function adoptLatestPage(session: LocalComputerSession) {
  const latest = session.context
    .pages()
    .filter((page) => !page.isClosed())
    .at(-1);
  if (latest && latest !== session.page) {
    await session.page
      .evaluate((marker) => {
        if (window.name === marker) window.name = "";
      }, session.marker)
      .catch(() => undefined);
    session.page = latest;
    await latest.evaluate((marker) => {
      window.name = marker;
    }, session.marker);
  }
}

export async function navigateLocalComputer(
  scope: LocalComputerScope,
  url: unknown,
  toolCallId?: string,
) {
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  await session.page.goto(await validatePublicComputerUrl(url), {
    // `commit` confirma que o servidor respondeu e permite que a tela ao vivo
    // apareça imediatamente; SPAs podem manter domcontentloaded pendente por muito tempo.
    waitUntil: "commit",
    timeout: 20_000,
  });
  await session.page
    .waitForLoadState("domcontentloaded", { timeout: 1_200 })
    .catch(() => undefined);
  const summary = {
    url: session.page.url(),
    title:
      (await settleWithin(
        session.page.title().catch(() => ""),
        800,
      ).catch(() => "")) || null,
    text: "",
    truncated: false,
  };
  if (toolCallId) void storePageFrame(session, toolCallId).catch(() => undefined);
  return summary;
}

export async function readLocalComputer(scope: LocalComputerScope) {
  const session = await getLocalComputer(scope);
  return pageSummary(session.page);
}

export async function snapshotLocalComputer(scope: LocalComputerScope) {
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  session.snapshotId += 1;
  session.refs.clear();
  const elements = await session.page
    .locator("a,button,input,textarea,select,[role=button],[role=link],[contenteditable=true]")
    .evaluateAll((nodes) => {
      // Tudo serializável aqui dentro: nós DOM não cruzam o boundary do
      // Playwright. Passada única com rejeições baratas primeiro (índice,
      // disabled, bounds) e só então o getComputedStyle — que força recálculo
      // de estilo e é o custo dominante em páginas grandes. Para após o teto.
      const out: Array<{
        ref: string;
        tag: string;
        role: string | null;
        name: string;
        type: string | undefined;
        value: string | undefined;
      }> = [];
      for (let index = 0; index < nodes.length && out.length < 200; index += 1) {
        if (index >= 1200) break;
        const element = nodes[index] as HTMLElement;
        if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true")
          continue;
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) continue;
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity || "1") <= 0
        )
          continue;
        // O ref ancora o clique futuro via [data-nullain-ref] (ver target()).
        const ref = `e${out.length + 1}`;
        element.dataset.nullainRef = ref;
        const input = element as HTMLInputElement;
        const rawName =
          element.getAttribute("aria-label") ||
          element.innerText?.trim() ||
          input.placeholder ||
          input.name ||
          "";
        out.push({
          ref,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          // Nomes gigantes viram milhares de tokens: 120 chars identificam.
          name: rawName.replace(/\s+/g, " ").trim().slice(0, 120),
          type: input.type || undefined,
          value:
            input.type === "password"
              ? undefined
              : typeof input.value === "string" && input.value
                ? input.value.slice(0, 200)
                : undefined,
        });
      }
      return out;
    });
  for (const element of elements) session.refs.set(element.ref, element.ref);
  return { snapshotId: session.snapshotId, url: session.page.url(), elements };
}

function target(session: LocalComputerSession, ref: unknown, snapshotId: unknown) {
  if (typeof snapshotId !== "number" || snapshotId !== session.snapshotId) {
    throw new Error("Snapshot expirado. Capture um novo snapshot antes de interagir.");
  }
  if (typeof ref !== "string" || !session.refs.has(ref)) throw new Error("Referência inválida.");
  return session.page.locator(`[data-nullain-ref=${JSON.stringify(ref)}]`).first();
}

export async function clickLocalComputer(
  scope: LocalComputerScope,
  ref: unknown,
  snapshotId: unknown,
) {
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  await target(session, ref, snapshotId).click({ timeout: 15_000 });
  await session.page.waitForTimeout(300);
  await adoptLatestPage(session);
  return pageSummary(session.page);
}

export async function typeLocalComputer(
  scope: LocalComputerScope,
  ref: unknown,
  snapshotId: unknown,
  text: unknown,
  submit = false,
) {
  if (typeof text !== "string" || text.length > 20_000) throw new Error("Texto inválido.");
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  const locator = target(session, ref, snapshotId);
  try {
    await locator.fill(text, { timeout: 15_000 });
  } catch {
    await locator.click({ timeout: 15_000 });
    await session.page.keyboard.press("Control+A").catch(() => undefined);
    await session.page.keyboard.type(text);
  }
  if (submit) await locator.press("Enter");
  await session.page.waitForTimeout(300);
  return pageSummary(session.page);
}

export async function keyLocalComputer(scope: LocalComputerScope, key: unknown) {
  if (typeof key !== "string" || !key.trim() || key.length > 64) throw new Error("Tecla inválida.");
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  await session.page.keyboard.press(key);
  return pageSummary(session.page);
}

export async function scrollLocalComputer(scope: LocalComputerScope, deltaY: unknown) {
  const amount = typeof deltaY === "number" && Number.isFinite(deltaY) ? deltaY : 600;
  if (Math.abs(amount) > 10_000) throw new Error("Deslocamento inválido.");
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  await session.page.mouse.wheel(0, amount);
  return { ok: true, url: session.page.url() };
}

export async function humanClickLocalComputer(scope: LocalComputerScope, x: unknown, y: unknown) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    throw new Error("Coordenadas inválidas.");
  }
  const session = await getLocalComputer(scope);
  if (session.control !== "human") throw new Error("Assuma o controle antes de clicar.");
  const viewport = session.page.viewportSize() ?? { width: 1280, height: 800 };
  if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
    throw new Error("Coordenadas fora da tela.");
  }
  await session.page.mouse.click(x, y);
  await session.page.waitForTimeout(150);
  await adoptLatestPage(session);
  return { ok: true };
}

export async function listLocalComputerTabs(scope: LocalComputerScope) {
  const session = await getLocalComputer(scope);
  return Promise.all(
    session.context
      .pages()
      .filter((page) => !page.isClosed())
      .map(async (page, index) => ({
        index,
        active: page === session.page,
        url: page.url(),
        title: (await page.title().catch(() => "")) || null,
      })),
  );
}

export async function switchLocalComputerTab(scope: LocalComputerScope, index: unknown) {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    throw new Error("Índice de aba inválido.");
  }
  const session = await getLocalComputer(scope);
  assertAssistantControl(session);
  const page = session.context.pages().filter((candidate) => !candidate.isClosed())[index];
  if (!page) throw new Error("Aba não encontrada.");
  await session.page
    .evaluate((marker) => {
      if (window.name === marker) window.name = "";
    }, session.marker)
    .catch(() => undefined);
  session.page = page;
  await page.bringToFront();
  await page.evaluate((marker) => {
    window.name = marker;
  }, session.marker);
  session.snapshotId = 0;
  session.refs.clear();
  return pageSummary(page);
}

export async function humanTypeLocalComputer(scope: LocalComputerScope, text: unknown) {
  if (typeof text !== "string" || text.length > 20_000) throw new Error("Texto inválido.");
  const session = await getLocalComputer(scope);
  if (session.control !== "human") throw new Error("Assuma o controle antes de digitar.");
  await session.page.keyboard.type(text);
  return { ok: true };
}

export async function humanKeyLocalComputer(scope: LocalComputerScope, key: unknown) {
  if (typeof key !== "string" || !key.trim() || key.length > 64) throw new Error("Tecla inválida.");
  const session = await getLocalComputer(scope);
  if (session.control !== "human") throw new Error("Assuma o controle antes de usar o teclado.");
  await session.page.keyboard.press(key);
  return { ok: true };
}

export async function humanScrollLocalComputer(scope: LocalComputerScope, deltaY: unknown) {
  const amount = typeof deltaY === "number" && Number.isFinite(deltaY) ? deltaY : 0;
  if (Math.abs(amount) > 10_000) throw new Error("Deslocamento inválido.");
  const session = await getLocalComputer(scope);
  if (session.control !== "human") throw new Error("Assuma o controle antes de rolar a página.");
  await session.page.mouse.wheel(0, amount);
  return { ok: true };
}

export async function supplyLocalComputerSecret(scope: LocalComputerScope, text: unknown) {
  if (typeof text !== "string" || !text || text.length > 4_096)
    throw new Error("Segredo inválido.");
  const session = await getLocalComputer(scope);
  if (session.control !== "human") throw new Error("Assuma o controle antes de inserir o segredo.");
  const focused = session.page.locator(":focus");
  if ((await focused.count()) > 0) await focused.fill(text);
  else await session.page.keyboard.type(text);
  return { ok: true };
}

/**
 * Captura JPEG (não PNG): o frame serve só para exibição humana (o modelo
 * nunca vê imagem — as tools devolvem texto), e o JPEG q70 tem 5-10x menos
 * bytes, acelerando CDP + transferência + decode a cada poll de 650ms.
 */
async function captureFrame(page: Page): Promise<string> {
  const frame = await page.screenshot({ type: "jpeg", quality: 70, timeout: 8_000 });
  return frame.toString("base64");
}

export async function screenshotLocalComputer(scope: LocalComputerScope) {
  const session = await getLocalComputer(scope);
  const captured = await captureFrame(session.page)
    .then((frame) => {
      const value = { frame, url: session.page.url(), capturedAt: new Date().toISOString() };
      session.lastFrame = value;
      return value;
    })
    .catch((error) => {
      // Um paint temporariamente ocupado não deve apagar a tela ao vivo. Preserve
      // também URL e instante originais para nunca rotular um frame antigo como novo.
      if (session.lastFrame) return session.lastFrame;
      throw error;
    });
  const viewport = session.page.viewportSize() ?? { width: 1280, height: 800 };
  return {
    base64: captured.frame,
    width: viewport.width,
    height: viewport.height,
    capturedAt: captured.capturedAt,
    url: captured.url,
  };
}

async function storePageFrame(session: LocalComputerSession, toolCallId: string) {
  const frame = await captureFrame(session.page);
  session.lastFrame = {
    frame,
    url: session.page.url(),
    capturedAt: new Date().toISOString(),
  };
  session.frames.set(toolCallId, {
    url: session.page.url(),
    title: (await session.page.title().catch(() => "")) || null,
    frame,
  });
  while (session.frames.size > 40) session.frames.delete(session.frames.keys().next().value!);
}

export async function getLocalComputerPageFrame(scope: LocalComputerScope, toolCallId: string) {
  return (await getLocalComputer(scope)).frames.get(toolCallId) ?? null;
}

export async function getLocalComputerControl(scope: LocalComputerScope) {
  const session = await getLocalComputer(scope);
  return { holder: session.control, requested: false, reason: null, secretWanted: null };
}

export async function setLocalComputerControl(
  scope: LocalComputerScope,
  holder: "assistant" | "human",
) {
  const session = await getLocalComputer(scope);
  session.control = holder;
  return { holder: session.control, requested: false, reason: null, secretWanted: null };
}

export async function destroyLocalComputer(scope: LocalComputerScope) {
  const key = localComputerScopeKey(scope);
  const session = sessions().get(key);
  if (!session) return false;
  sessions().delete(key);
  await session.context.close().catch(() => undefined);
  return true;
}

/**
 * Destroys every live computer session owned by `ownerUserId` for `botId`
 * (all conversations). Called on bot deletion so logged-in cookies and pages
 * of a deleted bot never linger in memory — each bot's computer dies with it.
 */
export async function destroyBotComputers(ownerUserId: string, botId: string): Promise<number> {
  const prefix = `${ownerUserId}:${botId}:`;
  const keys = [...sessions().keys()].filter((key) => key.startsWith(prefix));
  for (const key of keys) {
    const session = sessions().get(key);
    sessions().delete(key);
    await session?.context.close().catch(() => undefined);
  }
  return keys.length;
}

export async function localComputerStatus(scope: LocalComputerScope) {
  try {
    const session = await getLocalComputer(scope);
    return { ready: true, provider: "local-playwright", url: session.page.url() };
  } catch (error) {
    return {
      ready: false,
      provider: "local-playwright",
      error: error instanceof Error ? error.message : "Computador local indisponível.",
    };
  }
}
