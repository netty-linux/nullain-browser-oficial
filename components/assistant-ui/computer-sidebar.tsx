"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/lib/ui-store";
import { MonitorIcon } from "lucide-react";
import { ComputerView } from "@/components/assistant-ui/computer-view";
import { useBotComputerTarget } from "@/components/bots/use-bot-computer";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useComposerComputer } from "./composer-plus-menu";

const DESKTOP_QUERY = "(min-width: 1280px)";

/**
 * Sidebar DIREITA da Nullain — tela do computador do bot.
 *
 * Só existe com o toggle Computador LIGADO: desligado, retorna null para não
 * ocupar nenhum pixel (nem o painel fixo de 28-44rem, nem o botão flutuante).
 * Monta UM painel por breakpoint (fixo no desktop, drawer no mobile): montar
 * os dois poluiria o CDP com screenshots em dobro, incluindo um painel
 * escondido por CSS que ninguém vê.
 */
export function ComputerSidebar({ className, ...props }: React.ComponentProps<"aside">) {
  const { computer } = useComposerComputer();
  // null = ainda não hidratou (evita mismatch SSR e flash de layout).
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(query.matches);
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  if (!computer || isDesktop === null) return null;
  return isDesktop ? (
    <DesktopComputerPanel className={className} {...props} />
  ) : (
    <MobileComputerDrawer />
  );
}

function DesktopComputerPanel({ className, ...props }: React.ComponentProps<"aside">) {
  const { ready, target } = useBotComputerTarget();
  return (
    <aside
      className={cn(
        "flex h-full w-[clamp(28rem,34vw,44rem)] shrink-0 flex-col border-l border-foreground/8 bg-sidebar/70",
        className,
      )}
      {...props}
    >
      <div className="aui-sidebar-content flex min-h-0 flex-1 flex-col px-5 py-5">
        <div className="mb-4 flex h-8 items-center gap-2.5 px-1 text-[15px] font-medium tracking-[-0.01em] text-foreground">
          <MonitorIcon className="size-4 shrink-0" />
          <span>Computador</span>
          {ready ? (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-emerald-500">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              Ao vivo
            </span>
          ) : null}
        </div>
        {ready ? (
          <ComputerView
            key={`${target.basePath}:${target.computerId}`}
            computerId={target.computerId}
            basePath={target.basePath}
            active
            name={target.name}
            intervalMs={650}
            minWidth={320}
            minHeight={200}
          />
        ) : (
          <div className="aspect-video animate-pulse rounded-2xl border bg-muted/40" />
        )}
      </div>
    </aside>
  );
}

function MobileComputerDrawer() {
  const { ready, target } = useBotComputerTarget();
  const drawerOpen = useUIStore((s) => s.mobileComputerOpen);
  const setDrawerOpen = useUIStore((s) => s.setMobileComputerOpen);
  return (
    <div className="fixed right-4 top-4 z-30">
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-full border border-sky-500/30 bg-background/90 px-3 text-xs font-medium text-sky-600 shadow-md backdrop-blur-md transition-colors hover:bg-sky-500/10 dark:text-sky-400"
              aria-label="Abrir tela do Computador"
            >
              <span className="size-2 animate-pulse rounded-full bg-sky-500" />
              <MonitorIcon className="size-3.5" />
              <span>Computador</span>
            </button>
          }
        />
        <SheetContent side="right" className="w-[94vw] max-w-[720px] p-4">
          <SheetHeader className="border-b border-border/60 pb-3">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <MonitorIcon className="size-4" />
              <span>Computador do Agente</span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex-1 overflow-y-auto">
            {ready ? (
              <ComputerView
                key={`${target.basePath}:${target.computerId}:drawer`}
                computerId={target.computerId}
                basePath={target.basePath}
                active
                name={target.name}
                intervalMs={650}
                minWidth={260}
                minHeight={160}
              />
            ) : (
              <div className="aspect-video animate-pulse rounded-2xl border bg-muted/40" />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
