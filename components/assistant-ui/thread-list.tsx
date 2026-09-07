"use client";

import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  ThreadListItemMorePrimitive,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAui, useAuiState } from "@assistant-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";
import {
  PINNED_THREAD_IDS_STORAGE_KEY,
  parsePinnedThreadIds,
  serializePinnedThreadIds,
  updatePinnedThreadIds,
} from "@/lib/thread-pins";

type ThreadPinsContextValue = {
  isPinned: (threadId: string) => boolean;
  setPinned: (threadId: string, pinned: boolean) => void;
};

const ThreadPinsContext = createContext<ThreadPinsContextValue | null>(null);

const useThreadPins = () => {
  const context = useContext(ThreadPinsContext);
  if (!context) throw new Error("useThreadPins must be used inside ThreadPinsProvider");
  return context;
};

const ThreadPinsProvider: FC<PropsWithChildren> = ({ children }) => {
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      setPinnedThreadIds(
        parsePinnedThreadIds(window.localStorage.getItem(PINNED_THREAD_IDS_STORAGE_KEY)),
      );
    } catch {
      setPinnedThreadIds([]);
    } finally {
      setIsReady(true);
    }

    const syncPinnedThreads = (event: StorageEvent) => {
      if (event.key !== PINNED_THREAD_IDS_STORAGE_KEY) return;
      setPinnedThreadIds(parsePinnedThreadIds(event.newValue));
    };

    window.addEventListener("storage", syncPinnedThreads);
    return () => window.removeEventListener("storage", syncPinnedThreads);
  }, []);

  const pinnedThreadIdSet = useMemo(() => new Set(pinnedThreadIds), [pinnedThreadIds]);
  const setPinned = useCallback((threadId: string, pinned: boolean) => {
    setPinnedThreadIds((current) => {
      const next = updatePinnedThreadIds(current, threadId, pinned);
      try {
        window.localStorage.setItem(PINNED_THREAD_IDS_STORAGE_KEY, serializePinnedThreadIds(next));
      } catch {
        // A fixação continua funcionando nesta sessão se o navegador bloquear o storage.
      }
      return next;
    });
  }, []);
  const value = useMemo<ThreadPinsContextValue>(
    () => ({
      isPinned: (threadId) => pinnedThreadIdSet.has(threadId),
      setPinned,
    }),
    [pinnedThreadIdSet, setPinned],
  );

  return (
    <ThreadPinsContext.Provider value={value}>
      {isReady ? children : null}
    </ThreadPinsContext.Provider>
  );
};

export const ThreadList: FC = () => {
  return (
    <ThreadPinsProvider>
      <ThreadListPrimitive.Root className="flex flex-col">
        <ThreadListPrimitive.New className="flex h-11 items-center gap-2.5 rounded-xl px-2.5 text-[15px] font-medium tracking-[-0.015em] text-foreground/80 transition-colors hover:bg-foreground/[0.045] hover:text-foreground data-active:bg-foreground/[0.065]">
          <span className="flex size-7 shrink-0 items-center justify-center">
            <PlusIcon className="size-[18px] stroke-[1.8]" />
          </span>
          Nova conversa
        </ThreadListPrimitive.New>

        <ThreadListSection label="Fixadas" pinned />
        <ThreadListSection label="Conversas" pinned={false} />
      </ThreadListPrimitive.Root>
    </ThreadPinsProvider>
  );
};

const ThreadListSection: FC<{ label: string; pinned: boolean }> = ({ label, pinned }) => {
  const threadIds = useAuiState((state) => state.threads.threadIds);
  const { isPinned } = useThreadPins();
  const itemCount = threadIds.reduce(
    (count, threadId) => count + (isPinned(threadId) === pinned ? 1 : 0),
    0,
  );

  return (
    <section className="mt-3" aria-label={label}>
      <div className="flex h-7 items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/75">
        {pinned && <PinIcon className="size-3" aria-hidden="true" />}
        <span>{label}</span>
      </div>
      {itemCount === 0 ? (
        <p className="px-2.5 py-1 text-xs text-muted-foreground/65">
          {pinned ? "Nenhuma conversa fixada" : "Nenhuma conversa ainda"}
        </p>
      ) : (
        <ThreadListPrimitive.Items>
          {({ threadListItem }) =>
            isPinned(threadListItem.id) === pinned ? <ThreadListItem /> : null
          }
        </ThreadListPrimitive.Items>
      )}
    </section>
  );
};

function ThreadListItem() {
  const [isRenaming, setIsRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const threadId = useAuiState((state) => state.threadListItem.id);
  const { isPinned, setPinned } = useThreadPins();
  const pinned = isPinned(threadId);

  useEffect(() => {
    if (isRenaming || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);

  return (
    <ThreadListItemPrimitive.Root className="group relative flex h-10 items-center rounded-xl transition-colors hover:bg-foreground/[0.045] data-active:bg-foreground/[0.065] has-focus-visible:bg-foreground/[0.045] has-data-[state=open]:bg-foreground/[0.045] focus-visible:outline-none">
      {isRenaming ? (
        <ThreadListItemRename
          onDone={(restoreFocus) => {
            restoreFocusRef.current = restoreFocus;
            setIsRenaming(false);
          }}
        />
      ) : (
        <ThreadListItemPrimitive.Trigger
          ref={triggerRef}
          className="flex h-full min-w-0 flex-1 items-center truncate rounded-xl px-2.5 text-start text-sm font-normal tracking-[-0.01em] text-foreground/72 outline-none group-hover:pe-9 group-has-focus-visible:pe-9 group-has-data-[state=open]:pe-9 group-data-active:pe-9 group-data-active:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          <span className="min-w-0 flex-1 truncate">
            <ThreadListItemPrimitive.Title fallback="Nova conversa" />
          </span>
        </ThreadListItemPrimitive.Trigger>
      )}
      <ThreadListItemMorePrimitive.Root sharedFocusGroup>
        <ThreadListItemMorePrimitive.Trigger className="absolute end-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md p-0 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 data-[state=open]:opacity-100 hover:bg-accent flex items-center justify-center">
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">More options</span>
        </ThreadListItemMorePrimitive.Trigger>
        <ThreadListItemMorePrimitive.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="z-[100] min-w-36 rounded-md border bg-popover p-1 shadow-md"
        >
          <ThreadListItemMorePrimitive.Item
            onSelect={() => setIsRenaming(true)}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none select-none"
          >
            <PencilIcon className="size-4" /> Rename
          </ThreadListItemMorePrimitive.Item>
          <ThreadListItemMorePrimitive.Item
            onSelect={() => setPinned(threadId, !pinned)}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none select-none"
          >
            {pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
            {pinned ? "Desafixar" : "Fixar"}
          </ThreadListItemMorePrimitive.Item>
          <ThreadListItemPrimitive.Archive asChild>
            <ThreadListItemMorePrimitive.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none select-none">
              <ArchiveIcon className="size-4" /> Archive
            </ThreadListItemMorePrimitive.Item>
          </ThreadListItemPrimitive.Archive>
          <ThreadListItemPrimitive.Delete asChild>
            <ThreadListItemMorePrimitive.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive outline-none select-none">
              <TrashIcon className="size-4" /> Delete
            </ThreadListItemMorePrimitive.Item>
          </ThreadListItemPrimitive.Delete>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
    </ThreadListItemPrimitive.Root>
  );
}

const ThreadListItemRename: FC<{ onDone: (restoreFocus: boolean) => void }> = ({ onDone }) => {
  const aui = useAui();
  const title = useAuiState((s) => s.threadListItem.title) ?? "";
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = (restoreFocus: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    const next = value.trim();
    if (!next || next === title) {
      onDone(restoreFocus);
      return;
    }
    Promise.resolve()
      .then(() => aui.threadListItem.rename(next))
      .then(
        () => onDone(restoreFocus),
        () => {
          settledRef.current = false;
          if (restoreFocus) inputRef.current?.focus();
        },
      );
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone(true);
  };

  return (
    <Input
      ref={inputRef}
      autoFocus
      aria-label="Rename thread"
      value={value}
      className="h-7 min-w-0 flex-1 ps-2.5 pe-9 text-sm"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    />
  );
};
