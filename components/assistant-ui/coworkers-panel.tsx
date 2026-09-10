"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, MessageSquareIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotAvatar, useActiveBotIdentity } from "@/components/bots/bot-avatar";

/**
 * Painel "Coworkers" / "Team".
 *
 * Lista os bots persistentes da Nullain e permite ativá-los diretamente
 * para iniciar ou retomar conversas com qualquer coworker do time.
 */

export type AgentProfile = {
  id: string;
  name: string;
  description: string;
  status: "ready" | "paused";
  avatarColorToken: "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";
};

type CoworkersPanelProps = {
  onSelectAgent?: (agent: AgentProfile) => void;
};

export function CoworkersPanel({ onSelectAgent }: CoworkersPanelProps) {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeBot = useActiveBotIdentity();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bots", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Entre na sua conta para visualizar os bots da equipe.");
        } else {
          setError(`Não foi possível carregar os bots (${res.status}).`);
        }
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

  const selectAgent = (agent: AgentProfile) => {
    const previous =
      typeof window !== "undefined" ? localStorage.getItem("nullain-active-bot-id") : null;
    if (typeof window !== "undefined") {
      localStorage.setItem("nullain-active-bot-id", agent.id);
      if (previous !== agent.id || !localStorage.getItem("nullain-active-bot-conversation-id")) {
        localStorage.setItem("nullain-active-bot-conversation-id", crypto.randomUUID());
      }
      window.dispatchEvent(new Event("nullain-bot-changed"));
    }
    onSelectAgent?.(agent);
  };

  const visible = agents;

  return (
    <div className="flex h-full flex-col gap-1 px-1">
      <div className="flex items-center justify-between px-1.5 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Membros da Equipe
        </span>
        <button
          type="button"
          onClick={load}
          aria-label="Atualizar coworkers"
          title="Atualizar lista"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {error ? <p className="px-2 py-1 text-xs text-destructive">{error}</p> : null}

      {loading && visible.length === 0 ? (
        <div className="flex flex-col gap-2 px-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[64px] animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum coworker disponível.</p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto">
          {visible.map((agent) => {
            const isActive = activeBot?.id === agent.id;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => selectAgent(agent)}
                className={cn(
                  "group relative flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-all",
                  isActive
                    ? "bg-foreground/[0.08] shadow-xs ring-1 ring-border/50"
                    : "hover:bg-foreground/[0.045] active:bg-foreground/[0.07]",
                )}
                aria-label={`Conversar com ${agent.name}`}
              >
                <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                  <BotAvatar color={agent.avatarColorToken} name={agent.name} className="size-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-sm font-medium tracking-tight text-foreground">
                      {agent.name}
                    </span>
                    {isActive ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckIcon className="size-2.5" /> Ativo
                      </span>
                    ) : (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">
                        <MessageSquareIcon className="size-3 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {agent.description}
                    {agent.status === "paused" ? " · pausado" : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
