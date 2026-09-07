import type {
  ComposioCatalogResponse,
  ComposioCategoriesResponse,
  ComposioCategory,
  ComposioToolkit,
} from "@/lib/composio-catalog-types";

const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3.1/toolkits";
const COMPOSIO_LOGO_LIST_URL = "https://logos.composio.dev/api/list";
const PAGE_SIZE = 48;
const LOGO_CACHE_TTL_MS = 60 * 60 * 1000;
const POPULAR_TOOLKITS = [
  "github",
  "googlecalendar",
  "notion",
  "slack",
  "jira",
  "gmail",
  "googledrive",
  "linear",
  "trello",
  "discord",
] as const;

let logoCatalogCache: { slugs: string[]; expiresAt: number } | null = null;

export class ComposioCatalogError extends Error {
  constructor(
    readonly code:
      | "COMPOSIO_API_KEY_NOT_CONFIGURED"
      | "COMPOSIO_API_KEY_INVALID"
      | "COMPOSIO_RATE_LIMITED"
      | "COMPOSIO_UNAVAILABLE",
  ) {
    super(code);
  }
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function secureLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function category(value: unknown): ComposioCategory | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { id?: unknown; slug?: unknown; name?: unknown };
  const id = text(item.id ?? item.slug, 80).toLowerCase();
  const name = text(item.name, 100);
  return id && name ? { id, name } : null;
}

function toolkit(value: unknown): ComposioToolkit | null {
  if (!value || typeof value !== "object") return null;
  const item = value as {
    slug?: unknown;
    name?: unknown;
    auth_schemes?: unknown;
    meta?: {
      description?: unknown;
      logo?: unknown;
      categories?: unknown;
      tools_count?: unknown;
      triggers_count?: unknown;
    };
  };
  const slug = text(item.slug, 80).toLowerCase();
  const name = text(item.name, 120);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug) || !name) return null;

  const categories = Array.isArray(item.meta?.categories)
    ? item.meta.categories
        .map(category)
        .filter((entry): entry is ComposioCategory => entry !== null)
    : [];
  const authSchemes = Array.isArray(item.auth_schemes)
    ? item.auth_schemes.map((entry) => text(entry, 40)).filter(Boolean)
    : [];

  return {
    slug,
    name,
    description: text(item.meta?.description, 400),
    logo: secureLogoUrl(item.meta?.logo),
    categories,
    toolsCount: count(item.meta?.tools_count),
    triggersCount: count(item.meta?.triggers_count),
    authSchemes,
  };
}

function toolkitName(slug: string): string {
  const knownNames: Record<string, string> = {
    github: "GitHub",
    googlecalendar: "Google Calendar",
    googledrive: "Google Drive",
    gmail: "Gmail",
    jira: "Jira",
    notion: "Notion",
    slack: "Slack",
  };
  return (
    knownNames[slug] ??
    slug
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ")
  );
}

async function getOfficialLogoSlugs(): Promise<string[]> {
  if (logoCatalogCache && logoCatalogCache.expiresAt > Date.now()) {
    return logoCatalogCache.slugs;
  }

  let response: Response;
  try {
    response = await fetch(COMPOSIO_LOGO_LIST_URL, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");
  }
  if (!response.ok) throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");
  }

  const popularOrder = new Map<string, number>(
    POPULAR_TOOLKITS.map((slug, index) => [slug, index]),
  );
  const slugs = Object.keys(raw)
    .map((slug) => slug.toLowerCase())
    .filter((slug) => /^[a-z0-9][a-z0-9_-]*$/.test(slug))
    .slice(0, 5_000)
    .sort((left, right) => {
      const leftRank = popularOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = popularOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.localeCompare(right);
    });

  if (slugs.length === 0) throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");
  logoCatalogCache = { slugs, expiresAt: Date.now() + LOGO_CACHE_TTL_MS };
  return slugs;
}

function fallbackCursor(offset: number): string {
  return Buffer.from(`logos:${offset}`).toString("base64url");
}

function fallbackOffset(cursor?: string): number | null {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^logos:(\d{1,6})$/.exec(decoded);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function getLogoCatalog(options: {
  search?: string;
  cursor?: string;
}): Promise<ComposioCatalogResponse> {
  const offset = fallbackOffset(options.cursor) ?? 0;
  const query = options.search?.toLocaleLowerCase("en") ?? "";
  const allSlugs = await getOfficialLogoSlugs();
  const filtered = query
    ? allSlugs.filter((slug) =>
        `${slug} ${toolkitName(slug)}`.toLocaleLowerCase("en").includes(query),
      )
    : allSlugs;
  const page = filtered.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + page.length;

  return {
    items: page.map((slug) => ({
      slug,
      name: toolkitName(slug),
      description: "",
      logo: `https://logos.composio.dev/api/${encodeURIComponent(slug)}`,
      categories: [],
      toolsCount: 0,
      triggersCount: 0,
      authSchemes: [],
    })),
    nextCursor: nextOffset < filtered.length ? fallbackCursor(nextOffset) : null,
    totalItems: filtered.length,
  };
}

async function composioRequest(
  path: string,
  searchParams?: URLSearchParams,
  sessionApiKey?: string,
): Promise<unknown> {
  const apiKey = sessionApiKey?.trim() || process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new ComposioCatalogError("COMPOSIO_API_KEY_NOT_CONFIGURED");

  const url = `${COMPOSIO_API_BASE}${path}${searchParams ? `?${searchParams}` : ""}`;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ComposioCatalogError("COMPOSIO_API_KEY_INVALID");
  }
  if (response.status === 429) throw new ComposioCatalogError("COMPOSIO_RATE_LIMITED");
  if (!response.ok) throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");

  try {
    return await response.json();
  } catch {
    throw new ComposioCatalogError("COMPOSIO_UNAVAILABLE");
  }
}

export async function getComposioToolkits(options: {
  search?: string;
  category?: string;
  cursor?: string;
  apiKey?: string;
}): Promise<ComposioCatalogResponse> {
  const apiKey = options.apiKey?.trim() || process.env.COMPOSIO_API_KEY?.trim();
  const logoOffset = fallbackOffset(options.cursor);
  if (logoOffset !== null && options.cursor) return getLogoCatalog(options);
  if (apiKey?.toLowerCase().startsWith("ck_")) return getLogoCatalog(options);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    managed_by: "composio",
    sort_by: "usage",
  });
  if (options.search) params.set("search", options.search);
  if (options.category) params.set("category", options.category);
  if (options.cursor) params.set("cursor", options.cursor);

  try {
    const raw = (await composioRequest("", params, options.apiKey)) as {
      items?: unknown;
      next_cursor?: unknown;
      total_items?: unknown;
    };
    return {
      items: Array.isArray(raw.items)
        ? raw.items.map(toolkit).filter((entry): entry is ComposioToolkit => entry !== null)
        : [],
      nextCursor: text(raw.next_cursor, 512) || null,
      totalItems: count(raw.total_items),
    };
  } catch (error) {
    if (error instanceof ComposioCatalogError) return getLogoCatalog(options);
    throw error;
  }
}

export async function getComposioCategories(apiKey?: string): Promise<ComposioCategoriesResponse> {
  if (apiKey?.toLowerCase().startsWith("ck_")) return { items: [] };
  try {
    const raw = (await composioRequest("/categories", undefined, apiKey)) as { items?: unknown };
    return {
      items: Array.isArray(raw.items)
        ? raw.items.map(category).filter((entry): entry is ComposioCategory => entry !== null)
        : [],
    };
  } catch (error) {
    if (error instanceof ComposioCatalogError) return { items: [] };
    throw error;
  }
}
