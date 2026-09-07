"use client";

import { MonitorIcon } from "lucide-react";
import { ComputerView } from "@/components/assistant-ui/computer-view";
import { cn } from "@/lib/utils";

/**
 * Sidebar DIREITA da Nullain — tela do computador do bot.
 *
 * No molde do OpenBot: um título discreto e o tile. Sem parágrafos
 * explicativos — o estado quem dirige já vive no rodapé do tile.
 *
 * O ComputerView lida com: screenshot ao vivo, take control, hand back e o
 * prompt mascarado de secret (que nunca entra na conversa).
 */
const COMPUTER_ID =
  process.env.NEXT_PUBLIC_OPENBOT_AGENT_ID ?? "agent_3fb48f96-c51c-448d-adc9-5fdd3b9448ed";

export function ComputerSidebar({ className, ...props }: React.ComponentProps<"aside">) {
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
        <ComputerView
          computerId={COMPUTER_ID}
          active
          name="Nullain"
          intervalMs={1000}
          minWidth={200}
          minHeight={120}
        />
      </div>
    </aside>
  );
}
