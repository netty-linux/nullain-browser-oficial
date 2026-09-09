"use client";

import { NullainLogo } from "@/components/nullain-logo";
import { cn } from "@/lib/utils";
import { createContext, useContext, useEffect, useState } from "react";
type BotAvatarColor = "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";

const colors: Record<BotAvatarColor, string> = {
  ocean: "bg-sky-500/15",
  violet: "bg-violet-500/15",
  emerald: "bg-emerald-500/15",
  amber: "bg-amber-500/15",
  rose: "bg-rose-500/15",
  indigo: "bg-indigo-500/15",
};
export function BotAvatar({
  color = "ocean",
  name = "Nullain",
  className,
}: {
  color?: BotAvatarColor;
  name?: string;
  className?: string;
}) {
  return (
    <span
      aria-label={`Avatar de ${name}`}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
        colors[color],
        className,
      )}
    >
      <NullainLogo decorative static className="size-5" />
    </span>
  );
}

type ActiveBot = { id: string; name: string; avatarColorToken: BotAvatarColor; isSystem: 0 | 1 };
const ActiveBotContext = createContext<ActiveBot | null>(null);

export function ActiveBotProvider({ children }: { children: React.ReactNode }) {
  const [bot, setBot] = useState<ActiveBot | null>(null);
  useEffect(() => {
    let current = true;
    const load = () =>
      fetch("/api/bots")
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!current) return;
          const bots = (body?.bots ?? []) as ActiveBot[];
          const selected = localStorage.getItem("nullain-active-bot-id");
          setBot(
            bots.find((item) => item.id === selected) ?? bots.find((item) => item.isSystem) ?? null,
          );
        })
        .catch(() => {});
    void load();
    window.addEventListener("nullain-bot-changed", load);
    return () => {
      current = false;
      window.removeEventListener("nullain-bot-changed", load);
    };
  }, []);
  return <ActiveBotContext.Provider value={bot}>{children}</ActiveBotContext.Provider>;
}

export function ActiveBotAvatar({ className }: { className?: string }) {
  const bot = useContext(ActiveBotContext);
  return <BotAvatar color={bot?.avatarColorToken} name={bot?.name} className={className} />;
}

export function useActiveBotIdentity() {
  return useContext(ActiveBotContext);
}
