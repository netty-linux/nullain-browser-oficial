"use client";

import { ComposerAttachments, UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { File } from "@/components/assistant-ui/file";
import { ThreadFollowupSuggestions } from "@/components/follow-up-suggestions";
import { Image } from "@/components/assistant-ui/image";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { ActivityBlock } from "@/components/assistant-ui/activity-block";
import { MessageSources } from "@/components/assistant-ui/message-sources";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  CHAT_MODEL_IDS as MODEL_IDS,
  loadDisabledSkills,
  loadEffort,
  saveEffort,
  saveModel,
} from "@/lib/chat-model";
import {
  DEFAULT_VISION_CHAT_MODEL,
  VISION_CHAT_MODEL_IDS,
  isVisionChatModel,
} from "@/lib/model-catalog";
import { Button } from "@/components/ui/button";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ModelSelector, type ModelOption } from "@/components/assistant-ui/model-selector";
import {
  ComposerPlusMenu,
  ComposerComputerToggle,
  ComposerComputerContext,
  useComposerComputer,
} from "@/components/assistant-ui/composer-plus-menu";
import { SkillChip } from "@/components/assistant-ui/skill-chip";
import { ComposerSkillSelector, useSkillSelection } from "@/components/assistant-ui/skill-selector";
import { GenerationMedia } from "@/components/assistant-ui/generation-media";
import { RunningActivity } from "@/components/assistant-ui/running-activity";
import { PluginConnectionPrompt } from "@/components/assistant-ui/plugin-connection-prompt";
import { NullainLogo } from "@/components/nullain-logo";
import {
  GptOssLogo,
  DeepSeekLogo,
  KimiLogo,
  GlmLogo,
  QwenLogo,
  KimiCodeLogo,
  GeminiLogo,
  MinimaxLogo,
  NvidiaLogo,
  MistralLogo,
} from "@/components/assistant-ui/logos";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  type GroupByContext,
  type PartState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  MicIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PuzzleIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FC,
  type PropsWithChildren,
} from "react";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

const CHAT_MODEL_OPTIONS: readonly ModelOption[] = [
  {
    id: "ollama-cloud/gpt-oss:20b",
    name: "GPT-OSS",
    icon: <GptOssLogo />,
    keywords: ["openai", "gpt"],
    efforts: true,
  },
  {
    id: "ollama-cloud/deepseek-v4-flash:0731",
    name: "Deep Seek V4 Flash (0731)",
    icon: <DeepSeekLogo />,
    keywords: ["deepseek"],
  },
  {
    id: "ollama-cloud/deepseek-v4-pro:0813",
    name: "Deep Seek V4 Pro (0813)",
    icon: <DeepSeekLogo />,
    keywords: ["deepseek"],
  },
  {
    id: "ollama-cloud/kimi-k3",
    name: "KIMI K3",
    icon: <KimiLogo />,
    keywords: ["kimi", "moonshot"],
  },
  {
    id: "ollama-cloud/kimi-k2.7-code",
    name: "KIMI K2.7 Code",
    icon: <KimiCodeLogo />,
    keywords: ["kimi", "code"],
  },
  {
    id: "ollama-cloud/kimi-k2.6",
    name: "KIMI K2.6",
    icon: <KimiLogo />,
    keywords: ["kimi", "moonshot"],
  },
  {
    id: "ollama-cloud/glm-5.3",
    name: "GLM 5.3",
    icon: <GlmLogo />,
    keywords: ["glm", "zhipu", "z.ai"],
    efforts: true,
  },
  {
    id: "ollama-cloud/glm-5.2",
    name: "GLM 5.2",
    icon: <GlmLogo />,
    keywords: ["glm", "zhipu", "z.ai"],
    efforts: true,
  },
  {
    id: "ollama-cloud/glm-5.1",
    name: "GLM 5.1",
    icon: <GlmLogo />,
    keywords: ["glm", "zhipu", "z.ai"],
    efforts: true,
  },
  {
    id: "ollama-cloud/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    icon: <GlmLogo />,
    keywords: ["glm", "flash", "zhipu", "z.ai"],
    efforts: true,
  },
  {
    id: "ollama-cloud/qwen3.5",
    name: "Qwen 3.5",
    icon: <QwenLogo />,
    keywords: ["qwen", "alibaba"],
    efforts: true,
  },
  {
    id: "ollama-cloud/gemma4",
    name: "Gemma4",
    icon: <GeminiLogo />,
    keywords: ["gemma", "gemini", "google"],
  },
  {
    id: "ollama-cloud/minimax-m3",
    name: "Minimax M3",
    icon: <MinimaxLogo />,
    keywords: ["minimax"],
  },
  {
    id: "ollama-cloud/minimax-m2.7",
    name: "Minimax M2.7",
    icon: <MinimaxLogo />,
    keywords: ["minimax"],
  },
  {
    id: "ollama-cloud/nemotron-3-ultra",
    name: "Nemotron 3 Ultra",
    icon: <NvidiaLogo />,
    keywords: ["nemotron", "nvidia"],
    efforts: true,
  },
  {
    id: "ollama-cloud/nemotron-3-nano:30b",
    name: "Nemotron 3 Nano",
    icon: <NvidiaLogo />,
    keywords: ["nemotron", "nvidia", "nano"],
    efforts: true,
  },
  {
    id: "ollama-cloud/mistral-large-3:675b",
    name: "Mistral Large (675b)",
    icon: <MistralLogo />,
    keywords: ["mistral"],
  },
];

const VISION_MODEL_OPTIONS = VISION_CHAT_MODEL_IDS.map((modelId) => {
  const option = CHAT_MODEL_OPTIONS.find((model) => model.id === modelId);
  if (!option) throw new Error(`Modelo visual ausente do catálogo: ${modelId}`);
  return option;
});

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const groupNonTextActivity = groupPartByType({
  reasoning: ["group-activity"],
  "tool-call": ["group-activity"],
  "standalone-tool-call": [],
});

const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">Loading conversation</span>
    <Skeleton className="ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="ml-auto h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
);

export const Thread: FC<ThreadProps> = ({ components = EMPTY_COMPONENTS }) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot isEmpty={isEmpty} />
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean }> = ({ isEmpty }) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);
  // Estado do toggle Computador: hidrata do localStorage e persiste a cada
  // mudança. Vive AQUI (acima do composer) para o aviso de imagem+computador,
  // o guard de envio e o toggle lerem o MESMO valor.
  const [computer, setComputer] = useState(false);

  useEffect(() => {
    try {
      setComputer(localStorage.getItem("nullain-computer") === "1");
    } catch {
      // sem persistência
    }
  }, []);
  useEffect(() => {
    try {
      if (computer) localStorage.setItem("nullain-computer", "1");
      else localStorage.removeItem("nullain-computer");
    } catch {
      // sem persistência
    }
  }, [computer]);

  return (
    <ComposerComputerContext.Provider value={{ computer, setComputer }}>
      <ThreadPrimitive.Root
        className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
        style={{
          ["--thread-max-width" as string]: "52rem",
          ["--composer-bg" as string]: "var(--color-card)",
          ["--composer-radius" as string]: "1.65rem",
          ["--composer-padding" as string]: "14px",
        }}
      >
        <ThreadPrimitive.Viewport
          turnAnchor="top"
          data-slot="aui_thread-viewport"
          className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
        >
          <div
            className={cn(
              "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-6 sm:px-6",
              isEmpty && "justify-center pb-[6vh]",
            )}
          >
            <AuiIf condition={isNewChatView}>
              <Welcome />
            </AuiIf>
            <AuiIf condition={isHistoryLoadingView}>
              <ThreadHistorySkeleton />
            </AuiIf>

            <div data-slot="aui_message-group" className="mb-16 flex flex-col gap-y-8 empty:hidden">
              <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
            </div>

            <ThreadPrimitive.ViewportFooter
              className={cn(
                "aui-thread-viewport-footer flex flex-col gap-4 overflow-visible pb-5 md:pb-7",
                !isEmpty &&
                  "sticky bottom-0 mt-auto rounded-t-(--composer-radius) bg-gradient-to-t from-background via-background via-80% to-transparent pt-6",
              )}
            >
              <ThreadScrollToBottom />
              <ThreadFollowupSuggestions />
              <Composer isEmpty={isEmpty} />
              <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
                <ThreadSuggestions />
              </AuiIf>
            </ThreadPrimitive.ViewportFooter>
          </div>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </ComposerComputerContext.Provider>
  );
};

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom
      render={
        <TooltipIconButton
          tooltip="Scroll to bottom"
          variant="outline"
          className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
        />
      }
    >
      <ArrowDownIcon />
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mb-10 flex flex-col items-center px-4">
      <div className="mb-5 flex items-center gap-2.5 self-center text-foreground/62">
        <NullainLogo className="size-7" decorative />
        <h2 className="aui-thread-welcome-brand text-[13px] font-semibold uppercase tracking-[0.12em]">
          Nullain Agent
        </h2>
      </div>
      <h1 className="aui-thread-welcome-message-inner mx-auto w-full max-w-[38rem] text-center text-[clamp(2.15rem,3.35vw,3rem)] font-medium leading-[1.08] tracking-[-0.04em] text-balance">
        O que você quer saber do mundo?
      </h1>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  const aui = useAui();
  const suggestions = ["Pesquisar", "Criar", "Programar"] as const;

  const selectSuggestion = (suggestion: (typeof suggestions)[number]) => {
    aui.composer.setText(suggestion);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".aui-composer-input")?.focus();
    });
  };

  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-wrap items-center justify-center gap-2 px-4">
      {suggestions.map((suggestion) => (
        <PromptSuggestion
          key={suggestion}
          size="sm"
          onClick={() => selectSuggestion(suggestion)}
          className="h-9 border-foreground/8 bg-background/72 px-4 text-sm font-medium shadow-sm backdrop-blur-sm hover:bg-foreground/[0.045]"
        >
          {suggestion}
        </PromptSuggestion>
      ))}
    </div>
  );
};

const Composer: FC<{ isEmpty: boolean }> = ({ isEmpty }) => {
  // Computador + imagem não combinam: bloqueia o envio (botão, Enter e
  // submit do form) e mostra um aviso pedindo para desligar o computador.
  const hasImageAttachment = useAuiState(
    (s) => s.composer.attachments.some((a) => a.type === "image") ?? false,
  );
  const { computer } = useComposerComputer();
  const aui = useAui();
  const { selected, clear } = useSkillSelection();
  const [skillSendError, setSkillSendError] = useState("");
  const [checkingSkill, setCheckingSkill] = useState(false);

  const sendWithSelectedSkill = async () => {
    if (!selected || checkingSkill) return;
    setCheckingSkill(true);
    setSkillSendError("");
    try {
      if (loadDisabledSkills().includes(selected.name)) {
        throw new Error("Ative a skill selecionada antes de enviar.");
      }
      const response = await fetch(`/api/skills/${encodeURIComponent(selected.name)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "A skill selecionada não está mais disponível.");
      }
      aui.composer.setRunConfig({
        custom: { selectedSkill: { id: selected.name, title: selected.displayName } },
      });
      aui.composer.send();
      clear();
    } catch (error) {
      setSkillSendError(
        error instanceof Error ? error.message : "Não foi possível validar a skill.",
      );
    } finally {
      setCheckingSkill(false);
    }
  };

  return (
    <ComposerPrimitive.Root
      onSubmit={(e) => {
        if (hasImageAttachment && computer) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (selected) {
          e.preventDefault();
          e.stopPropagation();
          void sendWithSelectedSkill();
        }
      }}
      className="aui-composer-root relative flex w-full flex-col"
    >
      <ComposerPrimitive.AttachmentDropzone
        render={
          <div
            data-slot="aui_composer-shell"
            className={cn(
              "nullain-composer-surface flex w-full cursor-text flex-col rounded-(--composer-radius) border border-foreground/10 bg-card transition-[border-color,box-shadow,background-color] focus-within:border-foreground/16 data-[dragging=true]:border-dashed data-[dragging=true]:bg-muted/40",
              isEmpty ? "min-h-[11.75rem] p-4" : "p-3.5",
            )}
          />
        }
      >
        <ComposerAttachments />
        <ComposerComputerImageWarning />
        <ComposerSkillSelector />
        {skillSendError && (
          <p className="mx-3 mt-1 text-xs text-destructive" role="alert">
            {skillSendError} O rascunho foi preservado.
          </p>
        )}
        <ComposerPrimitive.Input
          placeholder="Pergunte qualquer coisa..."
          className={cn(
            "aui-composer-input caret-primary placeholder:text-muted-foreground/62 max-h-48 w-full resize-none bg-transparent px-3 py-1.5 leading-7 outline-none",
            isEmpty ? "min-h-[5.75rem] text-[19px]" : "min-h-11 text-base",
          )}
          rows={1}
          autoFocus
          enterKeyHint="send"
          aria-label="Message input"
        />
        <ComposerAction
          onSelectedSend={() => void sendWithSelectedSkill()}
          checkingSkill={checkingSkill}
        />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

/** Aviso inline exibido quando há imagem anexada + Computador ativo. */
const ComposerComputerImageWarning: FC = () => {
  const { computer, setComputer } = useComposerComputer();
  const hasImageAttachment = useAuiState(
    (s) => s.composer.attachments.some((a) => a.type === "image") ?? false,
  );
  if (!computer || !hasImageAttachment) return null;
  return (
    <div
      data-slot="aui-composer-computer-image-warning"
      role="alert"
      className="text-destructive bg-destructive/10 flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs"
    >
      <MonitorIcon className="size-3.5 shrink-0" />
      <span className="flex-1">
        O Computador não funciona com imagens anexadas. Desligue o Computador para fazer perguntas
        com imagens.
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive border-destructive/40 hover:bg-destructive/10 h-6 rounded-full px-2 text-xs"
        onClick={() => setComputer(false)}
      >
        Desligar
      </Button>
    </div>
  );
};

const ComposerAction: FC<{ onSelectedSend: () => void; checkingSkill: boolean }> = ({
  onSelectedSend,
  checkingSkill,
}) => {
  const [model, setModel] = useState("ollama-cloud/gpt-oss:20b");
  const [effort, setEffort] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const hasImageAttachment = useAuiState(
    (state) =>
      state.composer.attachments.some((attachment) => attachment.type === "image") ?? false,
  );
  const availableModels = hasImageAttachment ? VISION_MODEL_OPTIONS : CHAT_MODEL_OPTIONS;

  useEffect(() => {
    const saved = localStorage.getItem("nullain-model");
    if (saved && (MODEL_IDS as readonly string[]).includes(saved)) setModel(saved);
    else if (saved === "openai/gpt-oss:20b") setModel("ollama-cloud/gpt-oss:20b");
    const savedEffort = loadEffort();
    if (savedEffort) setEffort(savedEffort);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveModel(model);
  }, [model, hydrated]);
  useEffect(() => {
    if (hasImageAttachment && !isVisionChatModel(model)) {
      setModel(DEFAULT_VISION_CHAT_MODEL);
    }
  }, [hasImageAttachment, model]);
  useEffect(() => {
    if (hydrated && effort) saveEffort(effort);
  }, [effort, hydrated]);

  return (
    <div
      className="aui-composer-action-wrapper relative -mx-1 mt-1 flex items-center justify-between border-t border-foreground/[0.065] px-1 pt-3"
      suppressHydrationWarning
    >
      <div className="flex min-w-0 items-center gap-1.5" suppressHydrationWarning>
        <ComposerPlusMenu />
        <ComposerComputerToggle />
        <ModelSelector
          contentClassName="max-h-[560px] w-80"
          models={availableModels}
          value={model}
          onValueChange={setModel}
          effort={effort}
          onEffortChange={setEffort}
          variant="ghost"
          size="sm"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate
              render={
                <TooltipIconButton
                  tooltip="Voice input"
                  side="bottom"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="aui-composer-dictate text-muted-foreground hover:text-foreground size-9 rounded-full"
                  aria-label="Start voice input"
                />
              }
            >
              <MicIcon className="aui-composer-dictate-icon size-4" />
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation
              render={
                <TooltipIconButton
                  tooltip="Stop dictation"
                  side="bottom"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="aui-composer-stop-dictation text-destructive size-9 rounded-full"
                  aria-label="Stop voice input"
                />
              }
            >
              <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerSendWithGuard onSelectedSend={onSelectedSend} checkingSkill={checkingSkill} />
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel
            render={
              <Button
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-cancel size-9 rounded-full"
                aria-label="Stop generating"
              />
            }
          >
            <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

/** Botão de envio: desabilita quando há imagem anexada + Computador ativo. */
const ComposerSendWithGuard: FC<{ onSelectedSend: () => void; checkingSkill: boolean }> = ({
  onSelectedSend,
  checkingSkill,
}) => {
  const { computer } = useComposerComputer();
  const hasImageAttachment = useAuiState(
    (s) => s.composer.attachments.some((a) => a.type === "image") ?? false,
  );
  const blocked = computer && hasImageAttachment;
  const canSend = useAuiState((state) => state.composer.canSend);
  const { selected } = useSkillSelection();

  if (selected) {
    return (
      <TooltipIconButton
        tooltip="Send message"
        side="bottom"
        type="button"
        variant="default"
        size="icon"
        disabled={blocked || checkingSkill || !canSend}
        onClick={onSelectedSend}
        className="aui-composer-send size-9 rounded-full shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
        aria-label="Send message"
      >
        {checkingSkill ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : (
          <ArrowUpIcon className="size-4" />
        )}
      </TooltipIconButton>
    );
  }

  const button = (
    <TooltipIconButton
      tooltip={blocked ? "Desligue o Computador para enviar mensagens com imagens" : "Send message"}
      side="bottom"
      type="button"
      variant="default"
      size="icon"
      disabled={blocked}
      className="aui-composer-send size-9 rounded-full shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
      aria-label="Send message"
      aria-disabled={blocked}
    />
  );

  return (
    <ComposerPrimitive.Send render={button}>
      <ArrowUpIcon className="aui-composer-send-icon size-4" />
    </ComposerPrimitive.Send>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const NullainAvatar: FC<{ size?: string }> = ({ size = "size-8" }) => {
  return (
    <div
      className={`shrink-0 rounded-full overflow-hidden bg-transparent ${size} flex items-center justify-center`}
    >
      <NullainLogo className="size-full" />
    </div>
  );
};

const AssistantMessage: FC = () => {
  const { ToolFallback: ToolFallbackComponent = ToolFallback } =
    useContext(ThreadComponentsContext);

  // Se esta mensagem ainda está gerando, escondemos os cards individuais de
  // tool call / reasoning (que se acumulariam a cada nova ação) e mostramos
  // um card ÚNICO animado no lugar (RunningActivity), estilo Grok/Replit.
  const isRunning = useAuiState(
    (s) => s.thread.isRunning === true && s.message.status?.type === "running",
  );
  const messageParts = useAuiState((s) => s.message.parts ?? []);
  const hasToolParts = messageParts.some((part) => part.type === "tool-call");
  const activityGroupBy = useMemo(() => {
    const partIndices = new Map(messageParts.map((part, index) => [part, index]));
    let lastToolIndex = -1;
    for (let index = messageParts.length - 1; index >= 0; index--) {
      if (messageParts[index]?.type === "tool-call") {
        lastToolIndex = index;
        break;
      }
    }

    return (part: PartState, context: GroupByContext) => {
      if (part.type === "text") {
        const index = partIndices.get(part) ?? -1;
        // Texto anterior a uma chamada de ferramenta é narração de processo,
        // não a resposta final. Ele entra no mesmo bloco recolhido.
        return index >= 0 && index < lastToolIndex ? (["group-activity"] as const) : [];
      }
      return groupNonTextActivity(part, context);
    };
  }, [messageParts]);

  const ACTION_BAR_PT = "pt-1.5";
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150"
    >
      <SkillChip />
      <GenerationMedia />
      <PluginConnectionPrompt />
      <div className="flex min-w-0 items-start gap-3.5">
        <NullainAvatar size="size-10 mt-0.5" />
        <div
          data-slot="aui_assistant-message-content"
          className="text-foreground min-w-0 flex-1 overflow-hidden px-0 text-[16px] leading-7 tracking-[-0.006em] wrap-break-word"
        >
          {/* Durante a geração: card ÚNICO animado (spinner + nome + resumo),
              estilo Grok/Replit — em vez de empilhar um card por tool call. */}
          {isRunning && <RunningActivity className="mb-2" />}
          {!isRunning && <ActivityBlock />}

          {/* UM único GroupedParts renderiza TUDO em ordem de chegada. O bloco
              de atividade (ActivityBlock) guarda reasoning + tool calls dentro
              de UM collapsible — estilo Grok/Claude/ChatGPT. Mídia gerada e a
              tela do computador NÃO colapsam: são o resultado visível. */}
          <MessagePrimitive.GroupedParts groupBy={activityGroupBy}>
            {({ part }) => {
              switch (part.type) {
                case "group-activity":
                  // ActivityBlock agrega a mensagem inteira acima. Não
                  // renderizamos um bloco para cada fragmento do stream.
                  return null;
                case "text":
                  // Depois que uma tool entrou no turno, segura o texto de
                  // transição enquanto o agente trabalha. A resposta final
                  // aparece inteira quando o turno termina.
                  if (isRunning && hasToolParts) return null;
                  return <MarkdownText />;
                case "reasoning":
                  // reasoning solto (não agrupado): esconde — o bloco cobre.
                  if (isRunning) return null;
                  return null;
                case "tool-call":
                  // tool calls avulsos (fora de grupo): renderiza a tool UI
                  // registrada (mídia, computer) ou o fallback colapsável.
                  if (isRunning) return null;
                  return part.toolUI ?? <ToolFallbackComponent {...part} />;
                case "data":
                  return part.dataRendererUI;
                case "file":
                  return (
                    <div data-slot="aui_assistant-message-file" className="py-1">
                      <File {...part} />
                    </div>
                  );
                case "image":
                  return (
                    <div data-slot="aui_assistant-message-image" className="py-1">
                      <Image {...part} />
                    </div>
                  );
                case "indicator":
                  // ponto removido — Bloub já anima o thinking (evita ponto cinza quebrando visual)
                  return null;
                default:
                  return null;
              }
            }}
          </MessagePrimitive.GroupedParts>

          <MessageError />
        </div>
      </div>

      {/* Fontes citadas na resposta (chips com favicon + hover card). */}
      <MessageSources />

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-[3.35rem] flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in ms-auto flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}>
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        </AuiIf>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload render={<TooltipIconButton tooltip="Refresh" />}>
        <RefreshCwIcon />
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger
          render={<TooltipIconButton tooltip="More" className="data-[state=open]:bg-accent" />}
        >
          <MoreHorizontalIcon />
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5"
        >
          <ActionBarPrimitive.ExportMarkdown
            render={
              <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none" />
            }
          >
            <DownloadIcon className="size-4" />
            Export as Markdown
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="py-1">
    <File {...part} />
  </div>
);

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="py-1">
    <Image {...part} />
  </div>
);

const UserMessage: FC = () => {
  const isInternalMessage = useAuiState(
    (state) => state.message.metadata.custom.nullainInternal === true,
  );
  const selectedSkillValue = useAuiState((state) => state.message.metadata.custom.selectedSkill);
  const selectedSkill = useMemo(() => {
    const value = selectedSkillValue;
    if (!value || typeof value !== "object") return null;
    const id = (value as { id?: unknown }).id;
    const title = (value as { title?: unknown }).title;
    return typeof id === "string" ? { id, title: typeof title === "string" ? title : id } : null;
  }, [selectedSkillValue]);

  if (isInternalMessage) return null;

  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-1 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      {selectedSkill && (
        <div className="col-start-2 flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground">
            <PuzzleIcon className="size-3" /> {selectedSkill.title}
          </span>
        </div>
      )}

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-[1.35rem] px-4 py-2.5 text-[16px] leading-6 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.018)] wrap-break-word empty:hidden">
          <MessagePrimitive.Parts components={{ File: UserFilePart, Image: UserImagePart }} />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit
        render={<TooltipIconButton tooltip="Edit" className="aui-user-action-edit" />}
      >
        <PencilIcon />
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root data-slot="aui_edit-composer-wrapper" className="flex flex-col px-2">
      <ComposerPrimitive.Root className="aui-edit-composer-root border-border bg-card ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-2xl border">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel
            render={<Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5" />}
          >
            Cancel
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send render={<Button size="sm" className="h-8 rounded-full px-3.5" />}>
            Update
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous render={<TooltipIconButton tooltip="Previous" />}>
        <ChevronLeftIcon />
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}>
        <ChevronRightIcon />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
