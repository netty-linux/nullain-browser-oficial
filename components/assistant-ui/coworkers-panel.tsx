"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotAvatar } from "@/components/bots/bot-avatar";

/**
 * Painel "Coworkers" (Inversão FASE 5, parte 3).
 *
 * Lista os bots persistentes da própria Nullain. Não consulta nem depende do
 * roster legado do OpenBot.
 */

type AgentProfile = {
  id: string;
  name: string;
  description: string;
  status: "ready" | "paused";
  avatarColorToken: "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";
};

export function CoworkersPanel() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bots", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setError(`Não foi possível carregar os bots (${res.status}).`);
        setAgents([]);
        return;
      }
      const data = (await res.json()) as { bots?: AgentProfile[] };
      const list = data?.bots;
      setAgents(Array.isArray(list) ? list : []);
    } catch {
      setError("Não foi possível carregar os bots da Nullain.");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = agents;

  return (
    <div className="flex h-full flex-col gap-1 px-1">
      <div className="flex items-center justify-end px-1">
        <button
          type="button"
          onClick={load}
          aria-label="Refresh coworkers"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {error ? <p className="px-2 text-xs text-destructive">{error}</p> : null}

      {loading && visible.length === 0 ? (
        <div className="flex flex-col gap-2 px-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[64px] animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">Nenhum coworker visível.</p>
      ) : (
        <div className="flex flex-col gap-px">
          {visible.map((agent) => (
            <div
              key={agent.id}
              className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-foreground/5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                <BotAvatar color={agent.avatarColorToken} name={agent.name} className="size-8" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium tracking-tight text-foreground">
                    {agent.name}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {agent.description}
                  {agent.status === "paused" ? " · pausado" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
