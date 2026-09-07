"use client";

// Card ÚNICO de atividade durante a geração — estilo Grok/Replit.
// Em vez de acumular um card colapsável por tool call / bloco de reasoning,
// mostra UM card animado com spinner + nome da ação + resumo curto do que o
// agente está fazendo no momento. Não duplica: só reflete a ação em andamento.
//
// Integração: o AssistantMessage renderiza este componente quando
// s.thread.isRunning é true, e esconde os grupos individuais (ToolFallback /
// ReasoningRoot) até a resposta terminar.

import { LoaderIcon, WrenchIcon, BrainIcon } from "lucide-react";
import { useMemo, type FC } from "react";
import { useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

// Humaniza o slug da tool (ex.: "load_skill" → "Load skill").
function humanizeTool(toolName: string): string {
  return toolName
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Extrai um resumo curto dos argumentos do tool (evita despejar JSON inteiro)
function summarizeArgs(argsText?: string): string | undefined {
  if (!argsText) return undefined;
  const trimmed = argsText.trim();
  if (!trimmed) return undefined;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const entries = Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .slice(0, 3)
      .map(([k, v]) => {
        const val =
          typeof v === "string" ? v : Array.isArray(v) ? `[${v.length} itens]` : String(v);
        const short = val.length > 60 ? `${val.slice(0, 57)}…` : val;
        return `${k}: ${short}`;
      });
    if (entries.length) return entries.join(" · ");
    return undefined;
  } catch {
    const oneLine = trimmed.replace(/\s+/g, " ").slice(0, 80);
    return oneLine || undefined;
  }
}

// Separador que nunca aparece em texto normal (codifica os campos numa string).
const SEP = "\u0001";

/**
 * Lê o estado da mensagem e devolve a "ação em andamento" (a parte running
 * mais recente — tool call ou reasoning). Se não houver, retorna null.
 *
 * IMPORTANTE: `useAuiState` usa `useSyncExternalStore`, que re-executa o
 * selector como getSnapshot. Retornar um objeto literal novo a cada chamada
 * causa "getSnapshot should be cached to avoid an infinite loop". Por isso o
 * selector retorna uma STRING primitiva (comparada por valor via Object.is —
 * estável), codificando a ação; o objeto é derivado com useMemo.
 */
function useRunningAction(): {
  kind: "tool" | "reasoning";
  toolName?: string;
  summary?: string;
} | null {
  // String primitiva estável: "" = nada rodando; senão "tool\u0001<toolName>\u0001<summary>"
  // ou "reasoning".
  const encoded = useAuiState((s) => {
    if (s.thread.isRunning !== true || s.message.status?.type !== "running") return "";
    const parts = s.message.parts ?? [];
    // percorre de trás pra frente: a ação mais recente em execução
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i] as {
        type?: string;
        status?: { type?: string };
        toolName?: string;
        argsText?: string;
      };
      if (!p || p.status?.type !== "running") continue;
      if (p.type === "reasoning") return "reasoning";
      if (p.type === "tool-call") {
        const summary = summarizeArgs(p.argsText) ?? "";
        // evita que caracteres estranhos quebrem o split
        const name = (p.toolName ?? "").replace(SEP, "");
        return `tool${SEP}${name}${SEP}${summary.replace(SEP, "")}`;
      }
    }
    return "";
  });

  // Deriva o objeto a partir da string estável (sem objetos novos no selector).
  return useMemo(() => {
    if (!encoded) return null;
    if (encoded === "reasoning") return { kind: "reasoning" };
    const [kind, toolName, summary] = encoded.split(SEP);
    if (kind !== "tool") return null;
    return { kind: "tool", toolName: toolName || undefined, summary: summary || undefined };
  }, [encoded]);
}

/**
 * Card único de atividade. Spinner girando + ícone + nome da ação + resumo
 * curto. Fica "vivo" enquanto o agente trabalha; some quando termina.
 */
export const RunningActivity: FC<{ className?: string }> = ({ className }) => {
  const action = useRunningAction();
  if (!action) return null;

  const isTool = action.kind === "tool";
  const Icon = isTool ? WrenchIcon : BrainIcon;
  const label = isTool
    ? `Usando ${action.toolName ? humanizeTool(action.toolName) : "ferramenta"}`
    : "Raciocinando…";

  return (
    <div
      data-slot="running-activity"
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1",
        "text-muted-foreground flex w-fit max-w-full items-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 px-3 py-2 duration-200",
        className,
      )}
    >
      <LoaderIcon
        data-slot="running-activity-spinner"
        className="size-4 shrink-0 animate-spin [animation-duration:0.6s]"
      />
      <Icon className="size-4 shrink-0" />
      <div className="flex min-w-0 flex-col">
        <span
          data-slot="running-activity-label"
          className="text-xs font-medium leading-none tabular-nums"
        >
          {label}
        </span>
        {action.summary && (
          <span
            data-slot="running-activity-summary"
            className="mt-1 line-clamp-1 break-all text-[10px] leading-none text-muted-foreground/70"
          >
            {action.summary}
          </span>
        )}
      </div>
    </div>
  );
};
