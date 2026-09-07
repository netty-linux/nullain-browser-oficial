"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAui, useAuiState } from "@assistant-ui/react";
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PlugIcon,
  RotateCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  UnplugIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  ComposioCatalogError,
  ComposioCatalogResponse,
  ComposioCategoriesResponse,
  ComposioToolkit,
} from "@/lib/composio-catalog-types";
import { loadIntegrations, saveIntegrations } from "@/lib/chat-model";
import {
  CONFIRMED_CONNECTIONS_SESSION_KEY,
  CONNECTION_CANDIDATES_SESSION_KEY,
  INTEGRATION_SESSION_KEY,
  isIntegrationConsumerKey,
  PENDING_CONNECTION_SESSION_KEY,
  sanitizeIntegrationKey,
} from "@/lib/integration-key";
import {
  findConfirmedPluginSlugs,
  findRequestedPluginSlugs,
  normalizePluginSearch,
} from "@/lib/plugin-connections";
import { cn } from "@/lib/utils";

const CATALOG_ENDPOINT = "/api/plugins/catalog";

function readStoredSlugs(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter(
            (slug): slug is string =>
              typeof slug === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug),
          )
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeStoredSlugs(key: string, slugs: Iterable<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...new Set(slugs)].slice(0, 16)));
  } catch {
    // O estado em memória continua funcional quando o storage está bloqueado.
  }
}

function displaySlug(slug: string): string {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function ComposioLogo({ toolkit }: { toolkit: Pick<ComposioToolkit, "slug" | "name" | "logo"> }) {
  const fallback = `https://logos.composio.dev/api/${encodeURIComponent(toolkit.slug)}`;
  const [source, setSource] = useState<string | null>(toolkit.logo ?? fallback);

  useEffect(() => setSource(toolkit.logo ?? fallback), [fallback, toolkit.logo]);

  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-foreground/8 bg-white shadow-sm dark:bg-white/95">
      {source ? (
        <img
          src={source}
          alt={`Logo ${toolkit.name}`}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="size-8 object-contain"
          onError={() => setSource(source === fallback ? null : fallback)}
        />
      ) : (
        <PlugIcon className="size-5 text-neutral-400" aria-hidden="true" />
      )}
    </span>
  );
}

function MarketplaceCard({
  toolkit,
  connected,
  pending,
  disabled,
  onConnect,
  onDisconnect,
}: {
  toolkit: ComposioToolkit;
  connected: boolean;
  pending: boolean;
  disabled: boolean;
  onConnect: (toolkit: ComposioToolkit) => void;
  onDisconnect: (toolkit: ComposioToolkit) => void;
}) {
  return (
    <article className="group flex min-h-44 flex-col rounded-[1.25rem] border border-foreground/8 bg-card p-5 shadow-[0_12px_32px_-26px_rgb(0_0_0/0.34)] transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_18px_38px_-25px_rgb(0_0_0/0.4)]">
      <div className="flex items-start justify-between gap-4">
        <ComposioLogo toolkit={toolkit} />
        {connected && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckIcon className="size-3" /> Conectado
          </span>
        )}
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold tracking-tight">{toolkit.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {toolkit.description || `Conecte a Nullain ao ${toolkit.name}.`}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="truncate text-[11px] text-muted-foreground">
          {toolkit.toolsCount > 0
            ? `${toolkit.toolsCount.toLocaleString("pt-BR")} ferramentas`
            : toolkit.categories[0]?.name || "Integração"}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => (connected ? onDisconnect(toolkit) : onConnect(toolkit))}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
            connected
              ? "border border-foreground/10 bg-background text-foreground hover:bg-destructive/10 hover:text-destructive"
              : "bg-foreground text-background hover:bg-foreground/85 disabled:opacity-50",
          )}
        >
          {pending ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : connected ? (
            <UnplugIcon className="size-3.5" />
          ) : (
            <PlugIcon className="size-3.5" />
          )}
          {pending ? "Processando" : connected ? "Desconectar" : "Conectar"}
        </button>
      </div>
    </article>
  );
}

function CatalogErrorState({
  code,
  onRetry,
  onConfigure,
}: {
  code: string;
  onRetry: () => void;
  onConfigure: () => void;
}) {
  const configurationError =
    code === "COMPOSIO_API_KEY_NOT_CONFIGURED" || code === "COMPOSIO_API_KEY_INVALID";
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border border-dashed border-foreground/15 px-8 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5">
        {configurationError ? (
          <ShieldCheckIcon className="size-5 text-muted-foreground" />
        ) : (
          <RotateCwIcon className="size-5 text-muted-foreground" />
        )}
      </span>
      <h2 className="mt-4 text-base font-semibold">
        {configurationError ? "Configure o acesso ao catálogo" : "Catálogo indisponível"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {configurationError
          ? "Adicione sua chave de integração para carregar os aplicativos e seus logotipos."
          : "Não foi possível consultar as integrações agora. Tente novamente em alguns instantes."}
      </p>
      <button
        type="button"
        onClick={configurationError ? onConfigure : onRetry}
        className="mt-5 flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85"
      >
        {configurationError ? (
          <KeyRoundIcon className="size-3.5" />
        ) : (
          <RotateCwIcon className="size-3.5" />
        )}
        {configurationError ? "Adicionar chave" : "Tentar novamente"}
      </button>
    </div>
  );
}

export function PluginsMarketplace() {
  const router = useRouter();
  const aui = useAui();
  const messages = useAuiState((state) => state.thread.messages);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(normalizePluginSearch(query));
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<ComposioCategoriesResponse["items"]>([]);
  const [items, setItems] = useState<ComposioToolkit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [integrationKey, setIntegrationKey] = useState("");
  const [keyReady, setKeyReady] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [connectionCandidates, setConnectionCandidates] = useState<Set<string>>(new Set());
  const [verifiedConnectedSlugs, setVerifiedConnectedSlugs] = useState<Set<string>>(new Set());
  const [disconnectTarget, setDisconnectTarget] = useState<ComposioToolkit | null>(null);

  const historyConnectedSlugs = useMemo(
    () => findConfirmedPluginSlugs(messages, items),
    [items, messages],
  );
  const requestedSlugs = useMemo(() => findRequestedPluginSlugs(messages), [messages]);
  const connectedSlugs = useMemo(
    () =>
      new Set([
        ...verifiedConnectedSlugs,
        ...[...historyConnectedSlugs].filter((slug) => !connectionCandidates.has(slug)),
      ]),
    [connectionCandidates, historyConnectedSlugs, verifiedConnectedSlugs],
  );
  const connectedItems = useMemo(
    () =>
      [...connectedSlugs].map(
        (slug) =>
          items.find((item) => item.slug === slug) ?? {
            slug,
            name: displaySlug(slug),
            description: "Conexão ativa",
            logo: null,
            categories: [],
            toolsCount: 0,
            triggersCount: 0,
            authSchemes: [],
          },
      ),
    [connectedSlugs, items],
  );

  useEffect(() => {
    try {
      setIntegrationKey(sanitizeIntegrationKey(sessionStorage.getItem(INTEGRATION_SESSION_KEY)));
      setConnectionCandidates(
        new Set([
          ...readStoredSlugs(CONNECTION_CANDIDATES_SESSION_KEY),
          ...findRequestedPluginSlugs(messages),
        ]),
      );
      setVerifiedConnectedSlugs(readStoredSlugs(CONFIRMED_CONNECTIONS_SESSION_KEY));
    } catch {
      setIntegrationKey("");
    } finally {
      setKeyReady(true);
    }
  }, []);

  useEffect(() => {
    if (requestedSlugs.size === 0) return;
    setConnectionCandidates((current) => {
      const next = new Set([...current, ...requestedSlugs]);
      writeStoredSlugs(CONNECTION_CANDIDATES_SESSION_KEY, next);
      return next;
    });
  }, [requestedSlugs]);

  const requestOptions = (signal?: AbortSignal): RequestInit => ({
    signal,
    headers: integrationKey ? { "x-nullain-integration-key": integrationKey } : undefined,
  });

  const refreshConnectionStatus = useCallback(async () => {
    if (!keyReady || !integrationKey || connectionCandidates.size === 0) return;
    const response = await fetch(CATALOG_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nullain-integration-key": integrationKey,
      },
      body: JSON.stringify({ toolkits: [...connectionCandidates] }),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { items?: unknown };
    if (!Array.isArray(payload.items)) return;
    const active = new Set(
      payload.items.filter(
        (slug): slug is string =>
          typeof slug === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug),
      ),
    );
    setVerifiedConnectedSlugs(active);
    writeStoredSlugs(CONFIRMED_CONNECTIONS_SESSION_KEY, active);
  }, [connectionCandidates, integrationKey, keyReady]);

  useEffect(() => {
    void refreshConnectionStatus();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshConnectionStatus();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshConnectionStatus]);

  useEffect(() => {
    if (!keyReady) return;
    const controller = new AbortController();
    void fetch(`${CATALOG_ENDPOINT}?mode=categories`, requestOptions(controller.signal))
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as ComposioCategoriesResponse;
        setCategories(payload.items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [integrationKey, keyReady, retryKey]);

  useEffect(() => {
    if (!keyReady) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (deferredQuery) params.set("search", deferredQuery);
    if (category) params.set("category", category);
    setLoading(true);
    setError("");

    void fetch(`${CATALOG_ENDPOINT}?${params}`, requestOptions(controller.signal))
      .then(async (response) => {
        const payload = (await response.json()) as ComposioCatalogResponse | ComposioCatalogError;
        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "COMPOSIO_UNAVAILABLE");
        }
        setItems(payload.items);
        setNextCursor(payload.nextCursor);
        setTotalItems(payload.totalItems);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setNextCursor(null);
        setError(reason instanceof Error ? reason.message : "COMPOSIO_UNAVAILABLE");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [category, deferredQuery, integrationKey, keyReady, retryKey]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ cursor: nextCursor });
    if (deferredQuery) params.set("search", deferredQuery);
    if (category) params.set("category", category);
    try {
      const response = await fetch(`${CATALOG_ENDPOINT}?${params}`, requestOptions());
      const payload = (await response.json()) as ComposioCatalogResponse | ComposioCatalogError;
      if (!response.ok || "error" in payload) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.slug));
        return [...current, ...payload.items.filter((item) => !known.has(item.slug))];
      });
      setNextCursor(payload.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const connect = async (toolkit: ComposioToolkit) => {
    if (isRunning || !/^[a-z0-9][a-z0-9_-]*$/.test(toolkit.slug)) return;
    setPendingSlug(toolkit.slug);
    setKeyError("");
    try {
      const response = await fetch(`${CATALOG_ENDPOINT}?mode=connection`, requestOptions());
      if (!response.ok) {
        setKeyError("A chave de conexão não foi aceita. Use uma chave ativa com prefixo ck_.");
        setKeyDraft(integrationKey);
        setShowKey(false);
        setKeyModalOpen(true);
        return;
      }
      if (!loadIntegrations()) saveIntegrations(true);
      try {
        sessionStorage.setItem(PENDING_CONNECTION_SESSION_KEY, toolkit.slug);
        const candidates = new Set([
          ...readStoredSlugs(CONNECTION_CANDIDATES_SESSION_KEY),
          toolkit.slug,
        ]);
        writeStoredSlugs(CONNECTION_CANDIDATES_SESSION_KEY, candidates);
        setConnectionCandidates(candidates);
      } catch {
        // O card no chat continua disponível quando o storage está bloqueado.
      }
      aui.thread.append({
        role: "user",
        content: [{ type: "text", text: `Gere o link de autenticação para o ${toolkit.name}` }],
        metadata: {
          custom: { nullainInternal: true, action: "connect-plugin", plugin: toolkit.slug },
        },
        runConfig: {
          custom: { nullainInternal: true, action: "connect-plugin", plugin: toolkit.slug },
        },
      });
      router.push("/");
    } catch {
      setKeyError("Não foi possível validar o acesso agora. Tente novamente.");
      setKeyDraft(integrationKey);
      setShowKey(false);
      setKeyModalOpen(true);
    } finally {
      setPendingSlug(null);
    }
  };

  const disconnect = () => {
    const toolkit = disconnectTarget;
    if (!toolkit || isRunning) return;
    setPendingSlug(toolkit.slug);
    setDisconnectTarget(null);
    if (!loadIntegrations()) saveIntegrations(true);
    aui.thread.append({
      role: "user",
      content: [
        {
          type: "text",
          text: `Desconecte e remova a conexão ativa do ${toolkit.name}. Use as ferramentas de gerenciamento de conexões disponíveis e só confirme depois que a remoção for concluída.`,
        },
      ],
      metadata: {
        custom: { nullainInternal: true, action: "disconnect-plugin", plugin: toolkit.slug },
      },
      runConfig: {
        custom: { nullainInternal: true, action: "disconnect-plugin", plugin: toolkit.slug },
      },
    });
    router.push("/");
  };

  const openKeyModal = () => {
    setKeyError("");
    setKeyDraft(integrationKey);
    setShowKey(false);
    setKeyModalOpen(true);
  };

  const saveKey = () => {
    const value = sanitizeIntegrationKey(keyDraft);
    if (!isIntegrationConsumerKey(value)) {
      setKeyError("Use uma chave de conexão válida com prefixo ck_.");
      return;
    }
    try {
      sessionStorage.setItem(INTEGRATION_SESSION_KEY, value);
    } catch {
      // O estado em memória continua funcional quando o storage está bloqueado.
    }
    setIntegrationKey(value);
    setKeyError("");
    setKeyModalOpen(false);
  };

  const removeKey = () => {
    try {
      sessionStorage.removeItem(INTEGRATION_SESSION_KEY);
    } catch {
      // Nada a remover quando o storage está indisponível.
    }
    setIntegrationKey("");
    setKeyDraft("");
    setKeyModalOpen(false);
  };

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-20 border-b border-foreground/8 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[75rem] flex-col gap-6 px-6 py-7 lg:px-10 lg:py-9">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.035em]">
                Conecte suas ferramentas
              </h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">
                {totalItems > 0
                  ? `${totalItems.toLocaleString("pt-BR")} integrações disponíveis`
                  : "Pesquise e conecte seus apps em um clique"}
              </p>
            </div>
            <button
              type="button"
              onClick={openKeyModal}
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-foreground/10 bg-card px-3.5 text-xs font-semibold shadow-sm transition-colors hover:bg-foreground/5"
            >
              <KeyRoundIcon className="size-3.5" />
              {integrationKey ? "Alterar chave" : "Configurar acesso"}
            </button>
          </div>
          <label className="relative block max-w-3xl">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar GitHub, Gmail, Notion..."
              aria-label="Buscar integrações"
              autoComplete="off"
              className="h-[3.35rem] w-full rounded-[1.15rem] border border-foreground/10 bg-card pl-11 pr-4 text-[15px] shadow-[0_10px_28px_-24px_rgb(0_0_0/0.35)] outline-none transition-shadow placeholder:text-muted-foreground focus:border-foreground/20 focus:ring-4 focus:ring-foreground/5"
            />
          </label>
          <div className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Categorias">
            <button
              type="button"
              onClick={() => setCategory("")}
              aria-pressed={!category}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                !category
                  ? "bg-foreground text-background"
                  : "bg-foreground/5 text-muted-foreground hover:text-foreground",
              )}
            >
              Todos
            </button>
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                aria-pressed={category === item.id}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  category === item.id
                    ? "bg-foreground text-background"
                    : "bg-foreground/5 text-muted-foreground hover:text-foreground",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[75rem] space-y-12 px-6 py-9 lg:px-10 lg:py-11">
        <section aria-labelledby="connected-title">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 id="connected-title" className="text-base font-semibold tracking-tight">
                Conectados
              </h2>
            </div>
            {connectedItems.length > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {connectedItems.length} ativo{connectedItems.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {connectedItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {connectedItems.map((toolkit) => (
                <MarketplaceCard
                  key={toolkit.slug}
                  toolkit={toolkit}
                  connected
                  pending={false}
                  disabled
                  onConnect={connect}
                  onDisconnect={setDisconnectTarget}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/12 bg-background/60 px-5 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
                <PlugIcon className="size-4 text-muted-foreground" />
              </span>
              <div>
                <p className="text-xs font-medium">Nenhuma conexão confirmada ainda</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Escolha uma integração abaixo para começar.
                </p>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="explore-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 id="explore-title" className="text-base font-semibold tracking-tight">
                Explorar conexões
              </h2>
              {deferredQuery && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Resultados para “{deferredQuery}”
                </p>
              )}
            </div>
            {!loading && !error && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {items.length.toLocaleString("pt-BR")} de {totalItems.toLocaleString("pt-BR")}
              </span>
            )}
          </div>

          {error ? (
            <CatalogErrorState
              code={error}
              onRetry={() => setRetryKey((value) => value + 1)}
              onConfigure={openKeyModal}
            />
          ) : loading ? (
            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              aria-label="Carregando catálogo"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <div
                  key={index}
                  className="h-44 animate-pulse rounded-2xl border border-foreground/6 bg-foreground/[0.035]"
                />
              ))}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((toolkit) => (
                  <MarketplaceCard
                    key={toolkit.slug}
                    toolkit={toolkit}
                    connected={connectedSlugs.has(toolkit.slug)}
                    pending={pendingSlug === toolkit.slug}
                    disabled={isRunning}
                    onConnect={connect}
                    onDisconnect={setDisconnectTarget}
                  />
                ))}
              </div>
              {nextCursor && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex h-10 items-center gap-2 rounded-xl border border-foreground/10 bg-background px-5 text-xs font-medium shadow-sm transition-colors hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <LoaderCircleIcon className="size-3.5 animate-spin" />
                    ) : (
                      <ChevronRightIcon className="size-3.5" />
                    )}
                    {loadingMore ? "Carregando" : "Carregar mais"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-foreground/15 px-8 py-14 text-center">
              <SearchIcon className="mx-auto size-5 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-semibold">Nenhuma integração encontrada</h3>
              <p className="mt-1 text-xs text-muted-foreground">Tente outro nome ou categoria.</p>
            </div>
          )}
        </section>
      </div>

      <Dialog open={keyModalOpen} onOpenChange={setKeyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar acesso</DialogTitle>
            <DialogDescription>
              Insira uma chave de conexão com prefixo ck_. Ela fica somente nesta sessão do
              navegador e não é salva no servidor.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveKey();
            }}
          >
            <label htmlFor="integration-key" className="text-xs font-medium">
              Chave de integração
            </label>
            <div className="relative">
              <Input
                id="integration-key"
                type={showKey ? "text" : "password"}
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="Cole sua chave aqui"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="h-10 pr-10 font-mono text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            {keyError && (
              <p role="alert" className="text-xs leading-relaxed text-destructive">
                {keyError}
              </p>
            )}
          </form>
          <DialogFooter>
            {integrationKey && (
              <Button type="button" variant="ghost" onClick={removeKey} className="sm:mr-auto">
                Remover chave
              </Button>
            )}
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="button" onClick={saveKey} disabled={keyDraft.trim().length < 8}>
              Usar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desconectar {disconnectTarget?.name}</DialogTitle>
            <DialogDescription>
              A Nullain deixará de acessar este aplicativo até que você faça uma nova conexão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="button" variant="destructive" onClick={disconnect} disabled={isRunning}>
              <UnplugIcon className="size-4" />
              Desconectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
