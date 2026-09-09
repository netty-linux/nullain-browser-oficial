"use client";

import { MonitorIcon } from "lucide-react";
import { ComputerView } from "@/components/assistant-ui/computer-view";
import { useBotComputerTarget } from "@/components/bots/use-bot-computer";
import { cn } from "@/lib/utils";
import { useComposerComputer } from "./composer-plus-menu";

/**
 * Sidebar DIREITA da Nullain — tela do computador do bot.
 *
 * No molde do OpenBot: um título discreto e o tile. Sem parágrafos
 * explicativos — o estado quem dirige já vive no rodapé do tile.
 *
 * O ComputerView lida com: screenshot ao vivo, take control, hand back e o
 * prompt mascarado de secret (que nunca entra na conversa).
 *
 * Stage 3A: o target é resolvido pelo bot ativo — bot não-system com vínculo
 * usa o proxy governado `/api/bots/:botId/computer`; system bot e sem vínculo
 * preservam o computador legado da Nullain.
 */
export function ComputerSidebar({ className, ...props }: React.ComponentProps<"aside">) {
  const { ready, target } = useBotComputerTarget();
  const { computer } = useComposerComputer();
  return (
    <aside
      className={cn(
        "hidden h-full w-[18rem] shrink-0 flex-col border-l border-foreground/8 bg-sidebar/70 min-[1440px]:flex",
        className,
      )}
      {...props}
    >
      <div className="aui-sidebar-content flex min-h-0 flex-1 flex-col px-4 py-5">
        <div className="mb-4 flex h-8 items-center gap-2.5 px-1 text-[15px] font-medium tracking-[-0.01em] text-foreground">
          <MonitorIcon className="size-4 shrink-0" />
          <span>Computador</span>
        </div>
        {!computer ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
            Ative o Computador no campo de mensagem para iniciar uma sessão local.
          </div>
        ) : ready ? (
          <ComputerView
            key={`${target.basePath}:${target.computerId}`}
            computerId={target.computerId}
            basePath={target.basePath}
            active
            name={target.name}
            intervalMs={1000}
            minWidth={200}
            minHeight={120}
          />
        ) : (
          <div className="aspect-video animate-pulse rounded-2xl border bg-muted/40" />
        )}
      </div>
    </aside>
  );
}
