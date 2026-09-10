"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import { ThreadListItemPrimitive, ThreadListPrimitive, useAuiState } from "@assistant-ui/react";
import { MessageSquareIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { matchesBotProfile, matchesThreadItem } from "@/lib/thread-search";
import { BotAvatar } from "@/components/bots/bot-avatar";

type ThreadSearchPanelProps = {
  onOpenThread: () => void;
};

type SearchBot = {
  id: string;
  name: string;
  description: string;
  avatarColorToken: "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";
};

export const ThreadSearchPanel: FC<ThreadSearchPanelProps> = ({ onOpenThread }) => {
  const [query, setQuery] = useState("");
  const [bots, setBots] = useState<SearchBot[]>([]);
  const threadIds = useAuiState((state) => state.threads.threadIds);
  const threadItems = useAuiState((state) => state.threads.threadItems);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    fetch("/api/bots", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.bots)) setBots(data.bots);
      })
      .catch(() => {});
  }, []);

  const matchedThreadIds = useMemo(() => {
    const regularThreadIds = new Set(threadIds);
    return new Set(
      threadItems
        .filter((thread) => regularThreadIds.has(thread.id) && matchesThreadItem(thread, query))
        .map((thread) => thread.id),
    );
  }, [query, threadIds, threadItems]);

  const matchedBots = useMemo(() => {
    if (!hasQuery) return [];
    return bots.filter((b) => matchesBotProfile(b, query));
  }, [bots, hasQuery, query]);

  const totalResults = matchedThreadIds.size + matchedBots.length;

  const selectBot = (bot: SearchBot) => {
    if (typeof window !== "undefined") {
      const prev = localStorage.getItem("nullain-active-bot-id");
      localStorage.setItem("nullain-active-bot-id", bot.id);
      if (prev !== bot.id || !localStorage.getItem("nullain-active-bot-conversation-id")) {
        localStorage.setItem("nullain-active-bot-conversation-id", crypto.randomUUID());
      }
      window.dispatchEvent(new Event("nullain-bot-changed"));
    }
    onOpenThread();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 px-0.5">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar conversas e bots"
          placeholder="Buscar conversas ou bots..."
          className="h-10 rounded-xl bg-background ps-9 pe-3 text-sm shadow-none"
        />
      </div>

      <div className="flex h-9 shrink-0 items-center px-2.5 text-xs text-muted-foreground/70">
        {!hasQuery
          ? "Escopo: títulos e mensagens desta sessão + bots da equipe"
          : totalResults === 1
            ? "1 resultado encontrado"
            : `${totalResults} resultados encontrados`}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto space-y-3">
        {/* Seção de Bots correspondentes */}
        {hasQuery && matchedBots.length > 0 && (
          <div className="space-y-1">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Bots da Equipe
            </span>
            <div className="flex flex-col gap-0.5">
              {matchedBots.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => selectBot(bot)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-foreground/[0.045] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <BotAvatar color={bot.avatarColorToken} name={bot.name} className="size-6" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {bot.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {bot.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Seção de Conversas */}
        {hasQuery && matchedThreadIds.size > 0 && (
          <div className="space-y-1">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Conversas
            </span>
            <ThreadListPrimitive.Root className="no-scrollbar">
              <ThreadListPrimitive.Items>
                {({ threadListItem }) =>
                  matchedThreadIds.has(threadListItem.id) ? (
                    <ThreadSearchResult onOpenThread={onOpenThread} />
                  ) : null
                }
              </ThreadListPrimitive.Items>
            </ThreadListPrimitive.Root>
          </div>
        )}

        {hasQuery && totalResults === 0 && (
          <p className="px-2.5 py-3 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>
        )}
      </div>
    </div>
  );
};

const ThreadSearchResult: FC<ThreadSearchPanelProps> = ({ onOpenThread }) => (
  <ThreadListItemPrimitive.Root className="group relative flex h-10 items-center rounded-xl transition-colors hover:bg-foreground/[0.045] data-active:bg-foreground/[0.065] has-focus-visible:bg-foreground/[0.045] focus-visible:outline-none">
    <ThreadListItemPrimitive.Trigger
      onClick={onOpenThread}
      className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-start text-sm font-normal tracking-[-0.01em] text-foreground/72 outline-none group-data-active:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
    >
      <MessageSquareIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <ThreadListItemPrimitive.Title fallback="Nova conversa" />
      </span>
    </ThreadListItemPrimitive.Trigger>
  </ThreadListItemPrimitive.Root>
);
