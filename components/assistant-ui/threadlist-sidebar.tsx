"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Code2Icon,
  MessagesSquareIcon,
  MoonIcon,
  PlugIcon,
  PuzzleIcon,
  SearchIcon,
  SunIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GitHubIcon } from "@/components/github";
import { NullainLogo } from "@/components/nullain-logo";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { ThreadSearchPanel } from "@/components/assistant-ui/thread-search-panel";
import { CoworkersPanel } from "@/components/assistant-ui/coworkers-panel";
import { BotLauncher } from "@/components/bots/bot-launcher";

type SidebarTab = "chats" | "search" | "coworkers";
const SIDEBAR_COLLAPSED_KEY = "nullain-sidebar-collapsed";

/**
 * Barra lateral da Nullain — no molde do OpenBot: header com marca + New,
 * roster, rodapé com conta/tema. Sem sub-textos, sem divisórias extras.
 */
export function ThreadListSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [tab, setTab] = useState<SidebarTab>("chats");
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    if (!mobile.matches) setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    const collapseOnMobile = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) setCollapsed(true);
    };
    collapseOnMobile(mobile);
    mobile.addEventListener("change", collapseOnMobile);
    return () => mobile.removeEventListener("change", collapseOnMobile);
  }, []);

  const updateCollapsed = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "1" : "0");
  };

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("nullain-theme", next ? "dark" : "light");
    setDark(next);
  };

  const activeTab = pathname.startsWith("/code")
    ? "code"
    : pathname === "/plugins"
      ? "plugins"
      : pathname === "/skills"
        ? "skills"
        : tab;

  const options = [
    { key: "chats", label: "Chats", Icon: MessagesSquareIcon },
    { key: "code", label: "Code", Icon: Code2Icon },
    { key: "search", label: "Search", Icon: SearchIcon },
    { key: "skills", label: "Skills", Icon: PuzzleIcon },
    { key: "plugins", label: "Plugins", Icon: PlugIcon },
    { key: "coworkers", label: "Team", Icon: UsersIcon },
  ] as const;

  const selectTab = (nextTab: (typeof options)[number]["key"]) => {
    if (nextTab === "code") {
      router.push("/code");
      return;
    }
    if (nextTab === "plugins") {
      router.push("/plugins");
      return;
    }
    if (nextTab === "skills") {
      router.push("/skills");
      return;
    }

    setTab(nextTab);
    if (pathname !== "/") router.push("/");
  };

  return (
    <div
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border/80 bg-sidebar/95 text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed
          ? "w-16"
          : "w-[17rem] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl",
      )}
    >
      {/* Header: marca e controle com a mesma presença da navegação. */}
      <div className="flex h-[4.75rem] shrink-0 items-center justify-between gap-2 px-4">
        {collapsed ? (
          <div className="flex w-full flex-col items-center gap-1">
            <NullainLogo className="size-8" />
            <button
              type="button"
              onClick={() => updateCollapsed(false)}
              aria-label="Expandir menu lateral"
              title="Expandir menu lateral"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <ChevronsRightIcon className="size-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center overflow-hidden">
              <NullainLogo className="size-8" />
              <span className="truncate pl-2.5 text-[15px] font-semibold tracking-[-0.02em]">
                Nullain Agent
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateCollapsed(true)}
              aria-label="Recolher menu lateral"
              title="Recolher menu lateral"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <ChevronsLeftIcon className="size-4" />
            </button>
          </>
        )}
      </div>

      {/* Itens de opção */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-auto px-3">
        <div className="flex w-full flex-col gap-1">
          {options.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              aria-label={label}
              title={collapsed ? label : undefined}
              className={cn(
                "flex h-11 w-full items-center justify-start gap-2.5 rounded-xl px-2.5 text-[15px] font-medium tracking-[-0.015em] transition-colors",
                collapsed && "justify-center px-0",
                activeTab === key
                  ? "bg-foreground/[0.065] text-foreground shadow-[inset_0_0_0_1px_rgb(0_0_0/0.015)]"
                  : "text-foreground/76 hover:bg-foreground/[0.045] hover:text-foreground",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center">
                <Icon className="size-[18px] shrink-0 stroke-[1.8]" />
              </span>
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          ))}
        </div>

        {/* Conteúdo da aba selecionada (escondido quando colapsado) */}
        {!collapsed && (
          <div className="mt-3 flex-1 overflow-hidden border-t border-sidebar-border/60 pt-3">
            {pathname === "/plugins" ||
            pathname === "/skills" ||
            pathname.startsWith("/code") ? null : tab === "chats" ? (
              <>
                <BotLauncher />
                <ThreadList />
              </>
            ) : tab === "search" ? (
              <ThreadSearchPanel onOpenThread={() => setTab("chats")} />
            ) : (
              <CoworkersPanel />
            )}
          </div>
        )}
      </div>

      {/* Rodapé: tema + GitHub, sem texto de copyright */}
      <div
        className={cn(
          "flex shrink-0 items-center border-t border-sidebar-border/80",
          collapsed ? "flex-col gap-1 p-2" : "gap-1 p-3",
        )}
      >
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Alternar tema"
          className={cn(
            "flex h-11 flex-1 items-center gap-2.5 rounded-xl px-2.5 text-[15px] font-medium text-foreground/76 transition-colors hover:bg-foreground/[0.045] hover:text-foreground",
            collapsed && "h-10 w-full flex-none justify-center px-0",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center">
            {dark ? <SunIcon className="size-[18px]" /> : <MoonIcon className="size-[18px]" />}
          </span>
          {!collapsed && <span className="truncate">Tema</span>}
        </button>
        <a
          href="https://github.com/netty-linux"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub netty-linux"
          className={cn(
            "flex h-11 items-center gap-2 rounded-xl px-2 text-foreground/70 transition-colors hover:bg-foreground/[0.045] hover:text-foreground",
            collapsed && "h-10 w-full justify-center px-0",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center">
            <GitHubIcon className="size-[18px]" />
          </span>
        </a>
      </div>
    </div>
  );
}
