"use client";

import { useMemo, useState, type FC } from "react";
import { ThreadListItemPrimitive, ThreadListPrimitive, useAuiState } from "@assistant-ui/react";
import { MessageSquareIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { matchesThreadTitle } from "@/lib/thread-search";

type ThreadSearchPanelProps = {
  onOpenThread: () => void;
};

export const ThreadSearchPanel: FC<ThreadSearchPanelProps> = ({ onOpenThread }) => {
  const [query, setQuery] = useState("");
  const threadIds = useAuiState((state) => state.threads.threadIds);
  const threadItems = useAuiState((state) => state.threads.threadItems);
  const hasQuery = query.trim().length > 0;
  const matchedThreadIds = useMemo(() => {
    const regularThreadIds = new Set(threadIds);
    return new Set(
      threadItems
        .filter(
          (thread) => regularThreadIds.has(thread.id) && matchesThreadTitle(thread.title, query),
        )
        .map((thread) => thread.id),
    );
  }, [query, threadIds, threadItems]);

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
          aria-label="Buscar conversas"
          placeholder="Buscar conversas..."
          className="h-10 rounded-xl bg-background ps-9 pe-3 text-sm shadow-none"
        />
      </div>

      <div className="flex h-9 shrink-0 items-center px-2.5 text-xs text-muted-foreground/70">
        {!hasQuery
          ? "Pesquise pelo título da conversa"
          : matchedThreadIds.size === 1
            ? "1 conversa encontrada"
            : `${matchedThreadIds.size} conversas encontradas`}
      </div>

      <ThreadListPrimitive.Root className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {hasQuery && matchedThreadIds.size > 0 ? (
          <ThreadListPrimitive.Items>
            {({ threadListItem }) =>
              matchedThreadIds.has(threadListItem.id) ? (
                <ThreadSearchResult onOpenThread={onOpenThread} />
              ) : null
            }
          </ThreadListPrimitive.Items>
        ) : hasQuery ? (
          <p className="px-2.5 py-3 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
        ) : null}
      </ThreadListPrimitive.Root>
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
