import "server-only";

import { validatePublicComputerUrl } from "./local-computer";
import {
  readCachedSiteResolution,
  writeCachedSiteResolution,
  type CachedSiteResolution,
} from "./site-resolution-repository";

const DEFAULT_SEARXNG_URL = "http://127.0.0.1:8088";
const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const MIN_CONFIDENCE = 0.72;
const MIN_MARGIN = 0.1;

type SearchResult = { url?: unknown; title?: unknown; content?: unknown };
export type SiteCandidate = { url: string; hostname: string; title: string; score: number };

export type SiteResolution = {
  status: "resolved";
  query: string;
  canonicalUrl: string;
  hostname: string;
  confidence: number;
  source: "url" | "cache" | "searxng";
};

export class SiteResolutionError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "not_found" | "ambiguous" | "invalid",
    readonly candidates: SiteCandidate[] = [],
  ) {
    super(message);
    this.name = "SiteResolutionError";
  }
}

export function normalizeSiteQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /^\s*(?:por favor[, ]*)?(?:abra|abre|abrir|acesse|acessa|entre|entra|va para|visite|open|go to|visit)\s+(?:(?:o|a|the)\s+)?(?:(?:site|pagina|website)(?:\s+(?:do|da|de|of))?\s+)?/i,
      "",
    )
    .replace(/\s+(?:site|website|pagina)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 200);
}

function compact(value: string) {
  return normalizeSiteQuery(value)
    .replace(/\b(?:site|website|official|oficial|app|inc|ltd|llc)\b/g, "")
    .replace(/\s+/g, "");
}

function scoreCandidate(query: string, result: SearchResult, index: number): SiteCandidate | null {
  if (typeof result.url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(result.url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const domainLabel = hostname.split(".")[0] ?? "";
  const needle = compact(query);
  const title = typeof result.title === "string" ? result.title : "";
  const description = typeof result.content === "string" ? result.content : "";
  const haystack = compact(`${title} ${description}`);
  let score = Math.max(0.12, 0.4 - index * 0.025);
  if (domainLabel === needle) score += 0.42;
  else if (needle.length >= 3 && (domainLabel.includes(needle) || needle.includes(domainLabel)))
    score += 0.22;
  if (needle.length >= 3 && haystack.includes(needle)) score += 0.18;
  if (parsed.pathname === "/" || parsed.pathname === "") score += 0.08;
  if (parsed.protocol === "https:") score += 0.04;
  if (/\b(?:investor relations|wikipedia|profile|reviews?|news|login|sign in)\b/i.test(title))
    score -= 0.2;
  if (
    ["x.com", "twitter.com", "facebook.com", "linkedin.com", "wikipedia.org"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) &&
    !hostname.startsWith(`${needle}.`)
  )
    score -= 0.25;
  return {
    url: `${parsed.origin}/`,
    hostname: parsed.hostname.toLowerCase(),
    title,
    score: Math.max(0, Math.min(1, score)),
  };
}

async function searchCandidates(query: string, fetcher: typeof fetch): Promise<SiteCandidate[]> {
  const endpoint = new URL(
    "/search",
    process.env.NULLAIN_SEARXNG_URL?.trim() || DEFAULT_SEARXNG_URL,
  );
  endpoint.searchParams.set("q", `${query} official website`);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("categories", "general");
  endpoint.searchParams.set("safesearch", "1");
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SiteResolutionError(
      "O resolvedor local de sites (SearXNG) não está disponível.",
      "unavailable",
    );
  }
  if (!response.ok)
    throw new SiteResolutionError(
      `O SearXNG respondeu com HTTP ${response.status}.`,
      "unavailable",
    );
  const payload = (await response.json()) as { results?: unknown };
  if (!Array.isArray(payload.results))
    throw new SiteResolutionError("Resposta inválida do SearXNG.", "unavailable");
  const unique = new Map<string, SiteCandidate>();
  for (const [index, result] of payload.results.slice(0, 12).entries()) {
    const candidate = scoreCandidate(query, result as SearchResult, index);
    if (!candidate || unique.has(candidate.hostname)) continue;
    unique.set(candidate.hostname, candidate);
  }
  return [...unique.values()].sort((left, right) => right.score - left.score);
}

export async function resolvePublicSite(
  rawQuery: string,
  options: {
    fetcher?: typeof fetch;
    readCache?: typeof readCachedSiteResolution;
    writeCache?: typeof writeCachedSiteResolution;
    validateUrl?: typeof validatePublicComputerUrl;
  } = {},
): Promise<SiteResolution> {
  const validateUrl = options.validateUrl ?? validatePublicComputerUrl;
  const trimmed = rawQuery.trim();
  const explicitUrl = trimmed.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (explicitUrl) {
    const canonicalUrl = await validateUrl(explicitUrl);
    return {
      status: "resolved",
      query: trimmed,
      canonicalUrl,
      hostname: new URL(canonicalUrl).hostname,
      confidence: 1,
      source: "url",
    };
  }
  const query = normalizeSiteQuery(trimmed);
  if (!query) throw new SiteResolutionError("Informe o nome do site ou uma URL.", "invalid");
  const queryKey = compact(query);
  const cached = (options.readCache ?? readCachedSiteResolution)(queryKey);
  if (cached)
    return {
      status: "resolved",
      query,
      canonicalUrl: cached.canonicalUrl,
      hostname: cached.hostname,
      confidence: cached.confidence,
      source: "cache",
    };

  const candidates = await searchCandidates(query, options.fetcher ?? fetch);
  const valid: SiteCandidate[] = [];
  for (const candidate of candidates.slice(0, 5)) {
    try {
      valid.push({ ...candidate, url: await validateUrl(candidate.url) });
    } catch {
      // DNS points to a private/special network or the URL is invalid.
    }
  }
  const best = valid[0];
  if (!best)
    throw new SiteResolutionError(
      `Não encontrei um site público confiável para “${query}”.`,
      "not_found",
    );
  if (best.score < MIN_CONFIDENCE || (valid[1] && best.score - valid[1].score < MIN_MARGIN)) {
    throw new SiteResolutionError(
      `Encontrei resultados ambíguos para “${query}”; peça ao usuário a URL exata.`,
      "ambiguous",
      valid.slice(0, 3),
    );
  }
  const now = Date.now();
  const cachedValue: CachedSiteResolution = {
    queryKey,
    query,
    canonicalUrl: best.url,
    hostname: best.hostname,
    confidence: best.score,
    source: "searxng",
    verifiedAt: now,
    expiresAt: now + CACHE_TTL_MS,
  };
  (options.writeCache ?? writeCachedSiteResolution)(cachedValue);
  return {
    status: "resolved",
    query,
    canonicalUrl: best.url,
    hostname: best.hostname,
    confidence: best.score,
    source: "searxng",
  };
}
