"use client";

/**
 * Componentes de ação do composer — padrão Nullain:
 *
 * [+] [Computador] [modelo] [↑]
 *
 * - ComposerPlusMenu: concentra anexos, Plugins, Imagem e Video no "+".
 * - ComposerComputerToggle: mantém o navegador real como controle separado.
 */

import { createContext, useContext, useEffect, useState, type FC } from "react";
import { ImageIcon, MonitorIcon, PaperclipIcon, PlugIcon, PlusIcon, VideoIcon } from "lucide-react";
import { ComposerPrimitive } from "@assistant-ui/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { useBotComputerTarget } from "@/components/bots/use-bot-computer";
import {
  loadGeneration,
  loadGenerationMode,
  loadIntegrations,
  saveGeneration,
  saveGenerationMode,
  saveIntegrations,
} from "@/lib/chat-model";

/** Contexto do toggle Computador — compartilhado com o aviso de imagem+comptador. */
export const ComposerComputerContext = createContext<{
  computer: boolean;
  setComputer: (v: boolean | ((prev: boolean) => boolean)) => void;
}>({ computer: false, setComputer: () => {} });

export const useComposerComputer = () => useContext(ComposerComputerContext);

// ---------------------------------------------------------------------------
// "Computador" — toggle do Computador (navegação/busca por browser real)
// ---------------------------------------------------------------------------

export const ComposerComputerToggle: FC = () => {
  // Estado vem do ComposerComputerContext (ThreadRoot) — o mesmo que o aviso de
  // imagem+computador e o guard de envio leem. Sincronia garantida entre os três.
  const { computer: on, setComputer } = useComposerComputer();
  const { ready: targetReady, target } = useBotComputerTarget();
  const [runtimeState, setRuntimeState] = useState<"idle" | "starting" | "ready" | "error">("idle");

  useEffect(() => {
    if (!on) {
      setRuntimeState("idle");
      return;
    }
    if (!targetReady) {
      setRuntimeState("starting");
      return;
    }
    const controller = new AbortController();
    setRuntimeState("starting");
    fetch(`${target.basePath}/status`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { ready?: boolean } | null;
        if (!controller.signal.aborted)
          setRuntimeState(response.ok && body?.ready ? "ready" : "error");
      })
      .catch(() => {
        if (!controller.signal.aborted) setRuntimeState("error");
      });
    return () => controller.abort();
  }, [on, targetReady, target.basePath]);

  const statusLabel =
    on && !targetReady
      ? "será iniciado no primeiro envio"
      : runtimeState === "starting"
        ? "iniciando"
        : runtimeState === "error"
          ? "indisponível"
          : on
            ? "ativo"
            : "desativado";

  return (
    <TooltipIconButton
      tooltip={`Computador: ${statusLabel}`}
      side="bottom"
      variant="ghost"
      size="icon"
      className={cn(
        // w-auto vence o size-6 do TooltipIconButton (tailwind-merge mantém o
        // último) — sem isso o botão fica 24px e o label transborda por cima
        // do elemento vizinho.
        "aui-composer-computer h-7 w-auto gap-1.5 rounded-full px-2.5 active:scale-[0.96] motion-reduce:transition-none",
        on
          ? "text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/15"
          : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30",
      )}
      aria-label={`Computador ${statusLabel}`}
      data-runtime-state={runtimeState}
      aria-pressed={on}
      onClick={() => setComputer((v) => !v)}
    >
      <MonitorIcon className="aui-composer-computer-icon size-4" />
      <span className="aui-composer-computer-label text-[13px] font-medium leading-none">
        Computador
      </span>
      {on && runtimeState !== "ready" ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            runtimeState === "error" ? "bg-destructive" : "animate-pulse bg-current",
          )}
          aria-hidden="true"
        />
      ) : null}
    </TooltipIconButton>
  );
};

// ---------------------------------------------------------------------------
// "+" — Anexar arquivos / Plugins / Imagem / Video
// ---------------------------------------------------------------------------

type PlusMenuToggle = {
  key: "integrations" | "generationImage" | "generationVideo";
  label: string;
  icon: FC<{ className?: string }>;
  activeClass: string;
};

const PLUS_MENU_TOGGLES: PlusMenuToggle[] = [
  {
    key: "integrations",
    label: "Plugins",
    icon: PlugIcon,
    activeClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "generationImage",
    label: "Imagem",
    icon: ImageIcon,
    activeClass: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    key: "generationVideo",
    label: "Video",
    icon: VideoIcon,
    activeClass: "text-fuchsia-600 dark:text-fuchsia-400",
  },
];

export const ComposerPlusMenu: FC = () => {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [integrations, setIntegrations] = useState(false);
  const [generation, setGeneration] = useState(false);
  const [mode, setMode] = useState<"image" | "video">("image");

  useEffect(() => {
    setIntegrations(loadIntegrations());
    setGeneration(loadGeneration());
    setMode(loadGenerationMode());
    setHydrated(true);
  }, []);

  const toggle = (key: PlusMenuToggle["key"]) => {
    if (key === "integrations") {
      const next = !integrations;
      setIntegrations(next);
      if (hydrated) saveIntegrations(next);
      return;
    }
    // Geração: imagem e vídeo são o MESMO toggle com modos exclusivos.
    const wanted: "image" | "video" = key === "generationImage" ? "image" : "video";
    if (generation && mode === wanted) {
      setGeneration(false);
      if (hydrated) saveGeneration(false);
      return;
    }
    setGeneration(true);
    setMode(wanted);
    if (hydrated) {
      saveGeneration(true);
      saveGenerationMode(wanted);
    }
  };

  const isOn = (key: PlusMenuToggle["key"]): boolean => {
    if (key === "integrations") return integrations;
    if (key === "generationImage") return generation && mode === "image";
    return generation && mode === "video";
  };

  const hasActiveTool = integrations || generation;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <TooltipIconButton
            tooltip="Adicionar"
            side="bottom"
            variant="ghost"
            size="icon"
            className={cn(
              "aui-composer-plus relative size-7 rounded-full active:scale-[0.96] motion-reduce:transition-none",
              open
                ? "text-foreground bg-muted-foreground/15"
                : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30",
            )}
            aria-label="Abrir opções"
            aria-expanded={open}
          />
        }
      >
        <PlusIcon className="aui-composer-plus-icon size-4" />
        {hasActiveTool && !open ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-1 right-1 size-1.5 rounded-full",
              generation ? "bg-fuchsia-500" : "bg-emerald-500",
            )}
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-48 rounded-xl border-border/80 bg-popover p-1 shadow-lg"
      >
        <ComposerPrimitive.AddAttachment
          multiple
          render={
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm tracking-tight text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5"
              aria-label="Anexar arquivos"
            />
          }
        >
          <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-start">Anexar arquivos</span>
        </ComposerPrimitive.AddAttachment>

        {PLUS_MENU_TOGGLES.map(({ key, label, icon: Icon, activeClass }) => {
          const on = isOn(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={on}
              className={cn(
                "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm tracking-tight transition-colors",
                "text-foreground hover:bg-foreground/5 outline-none",
              )}
            >
              <Icon className={cn("size-4 shrink-0", on ? activeClass : "text-muted-foreground")} />
              <span className="flex-1 text-start">{label}</span>
              <span
                className={cn(
                  "text-[10px] font-medium tabular-nums",
                  on ? activeClass : "text-muted-foreground/60",
                )}
              >
                {on ? "ON" : "OFF"}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};
