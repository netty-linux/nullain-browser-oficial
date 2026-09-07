"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NullainLogo } from "@/components/nullain-logo";

/**
 * Painel "Coworkers" (Inversão FASE 5, parte 3).
 *
 * Lista os agentes/coworkers do OpenBot via proxy local `/api/ob/agents` (que
 * repassa ao OpenBot preservando o cookie de sessão). É o mesmo roster que a
 * UI do OpenBot mostra em /agents, agora dentro da casa Nullain.
 *
 * Só leitura nesta primeira versão: lista, mostra estado e permite abrir o
 * chat com o coworker (redireciona para o canal no OpenBot ou apenas exibe).
 * A criação/edição (endpoint, callback token, handoff) fica para uma próxima
 * iteração.
 */

type AgentProfile = {
  id: string;
  name: string;
  title: string;
  roleDescription: string;
  avatarSeed: string;
  visibility: "public" | "private";
  endpoint: string | null;
  builtIn: boolean;
  protocol: "openbot" | "ag_ui" | "a2a";
  hasAuth: boolean;
  modelId: string | null;
  computerAccess: boolean;
  hidden: boolean;
  mine: boolean;
};

/** A Nullain/Bloub coworker uses the mascot; others get an initials square. */
function isBloub(a: { name?: string; avatarSeed?: string }): boolean {
  return /^nullain/i.test(a.name ?? "") || /^nullain/i.test(a.avatarSeed ?? "");
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CoworkersPanel() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ob/agents", { credentials: "include" });
      if (!res.ok) {
        setError(`Não foi possível carregar os coworkers (${res.status}).`);
        setAgents([]);
        return;
      }
      const data = (await res.json()) as AgentProfile[] | { agents?: AgentProfile[] };
      const list = Array.isArray(data) ? data : data?.agents;
      setAgents(Array.isArray(list) ? list : []);
    } catch {
      setError("Não foi possível alcançar o OpenBot para listar os coworkers.");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Só a Nullain aparece no painel; os demais coworkers do OpenBot ficam
  // ocultos aqui (a identidade principal da casa é a Nullain).
  const visible = agents.filter((a) => !a.hidden && isBloub(a));

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
                {isBloub(agent) ? (
                  <NullainLogo className="size-8" decorative />
                ) : (
                  <span>{initialsOf(agent.name)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium tracking-tight text-foreground">
                    {agent.name}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {agent.roleDescription || agent.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
