"use client";

import { compressImageFile } from "@/lib/image-compress";
import {
  DEFAULT_VISION_CHAT_MODEL,
  SUPPORTED_IMAGE_ACCEPT,
  isSupportedImageMediaType,
  isVisionChatModel,
  resolveSupportedImageMediaType,
} from "@/lib/model-catalog";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { AttachmentAdapter } from "@assistant-ui/react";
import type { AppendMessage } from "@assistant-ui/react";
import {
  httpUrlPattern,
  parseDataUrl,
  resolveFileMediaType,
  resolveImageMediaType,
  toMediaWireUrl,
} from "@assistant-ui/core/internal";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { usePathname } from "next/navigation";

// Adapter de anexos: igual ao default (vercelAttachmentAdapter) mas comprime
// imagens grandes ANTES de virarem data URL base64 (ver lib/image-compress.ts).
const compressedImageAttachmentAdapter: AttachmentAdapter = {
  accept: SUPPORTED_IMAGE_ACCEPT,
  async add({ file }) {
    const mediaType = resolveSupportedImageMediaType(file);
    if (!mediaType) throw new Error("Use uma imagem PNG, JPEG, JPG ou WebP.");
    const normalized =
      file.type === mediaType
        ? file
        : new File([file], file.name, { type: mediaType, lastModified: file.lastModified });
    const compressed = await compressImageFile(normalized);
    return {
      id: crypto.randomUUID(),
      type: "image" as const,
      name: compressed.name,
      file: compressed,
      contentType: compressed.type,
      content: [],
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async send(attachment) {
    const file = attachment.file;
    if (!file) return { ...attachment, status: { type: "complete" }, content: [] };
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "image" as const,
          image: dataUrl,
          filename: attachment.name,
        },
      ],
    };
  },
  async remove() {},
};

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  loadEffort,
  loadDisabledSkills,
  loadGeneration,
  loadGenerationMode,
  loadIntegrations,
  loadModel,
  loadComputer,
} from "@/lib/chat-model";
import {
  INTEGRATION_SESSION_KEY,
  isIntegrationConsumerKey,
  sanitizeIntegrationKey,
} from "@/lib/integration-key";
import { ComputerToolUI } from "@/components/assistant-ui/computer-tool-ui";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { ComputerSidebar } from "@/components/assistant-ui/computer-sidebar";
import { SkillSelectionProvider } from "@/components/assistant-ui/skill-selector";
import { SkillCreatorToolUI } from "@/components/assistant-ui/skill-creator-tool-ui";
import {
  loadBotTranscript,
  readBotTranscript,
  useBotThreadHistoryAdapter,
  useBotTranscriptTarget,
} from "@/lib/bot-transcript-history";
import { useEffect, useRef } from "react";
import { BotCreatedDataUI, BotReviewDataUI } from "@/components/bots/bot-transcript-cards";
import { ActiveBotProvider } from "@/components/bots/bot-avatar";

function toNullainMessage(message: AppendMessage) {
  const parts = [
    ...message.content,
    ...(message.attachments?.flatMap((attachment) =>
      attachment.content.map((content) => ({
        ...content,
        filename: attachment.name,
        contentType: attachment.contentType,
      })),
    ) ?? []),
  ].map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    if (part.type === "image") {
      const mediaType = resolveImageMediaType(
        part.image,
        (part as typeof part & { contentType?: string }).contentType,
      );
      return {
        type: "file" as const,
        url: toMediaWireUrl(part.image, mediaType),
        mediaType,
        ...(part.filename ? { filename: part.filename } : {}),
      };
    }
    if (part.type === "file") {
      const mediaType = resolveFileMediaType(part.data, part.mimeType);
      return {
        type: "file" as const,
        url: part.sourceType === "id" ? part.data : toMediaWireUrl(part.data, mediaType),
        mediaType,
        ...(part.filename ? { filename: part.filename } : {}),
      };
    }
    if (part.type === "audio") {
      const mediaType = `audio/${part.audio.format}`;
      return {
        type: "file" as const,
        url: httpUrlPattern.test(part.audio.data)
          ? part.audio.data
          : `data:${mediaType};base64,${parseDataUrl(part.audio.data)?.data ?? part.audio.data}`,
        mediaType,
      };
    }
    if (part.type === "data")
      return { type: `data-${part.name}` as `data-${string}`, data: part.data };
    throw new Error(`Tipo de mensagem não suportado: ${(part as { type: string }).type}`);
  });
  return {
    role: message.role,
    parts,
    metadata: {
      ...message.metadata,
      custom: {
        ...message.metadata.custom,
        ...message.runConfig?.custom,
      },
    },
  } as never;
}

export const AssistantShell = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const pathname = usePathname();
  const transcriptTarget = useBotTranscriptTarget();
  const historyAdapter = useBotThreadHistoryAdapter(transcriptTarget);
  const runtime = useChatRuntime({
    toCreateMessage: toNullainMessage,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    adapters: {
      attachments: compressedImageAttachmentAdapter,
      history: historyAdapter,
    },
    transport: new AssistantChatTransport({
      api: "/api/chat",
      // Lê o modelo/esforço selecionados no ComposerAction a cada envio —
      // sem isso a rota sempre caía no MASTRA_MODEL default.
      prepareSendMessagesRequest: ({ messages }) => {
        const savedModel = loadModel();
        const latestUserMessage = [...messages]
          .reverse()
          .find((message) => message.role === "user");
        const hasImage =
          latestUserMessage?.parts.some(
            (part) =>
              part.type === "file" &&
              isSupportedImageMediaType((part as { mediaType?: unknown }).mediaType),
          ) ?? false;
        // O efeito visual do seletor e o clique em enviar podem acontecer no
        // mesmo frame. Este fallback elimina a corrida com o localStorage.
        const model =
          hasImage && !isVisionChatModel(savedModel) ? DEFAULT_VISION_CHAT_MODEL : savedModel;
        // Uma consumer key informada no marketplace vale também para o MCP do
        // chat. Antes ela era enviada somente ao catálogo, então os cards
        // apareciam, mas o kernel continuava usando uma credencial diferente.
        const integrationKey = sanitizeIntegrationKey(
          sessionStorage.getItem(INTEGRATION_SESSION_KEY),
        );
        // Thread ID estável por conversa (persistência de memória no kernel).
        // Gerado uma vez por sessão no localStorage; enviado no header.
        let threadId = localStorage.getItem("nullain-thread-id");
        if (
          !threadId ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(threadId)
        ) {
          threadId = crypto.randomUUID();
          localStorage.setItem("nullain-thread-id", threadId);
        }
        // O seletor de bots grava somente identificadores opacos. A rota
        // continua sendo a autoridade: ela exige sessão, verifica posse e
        // cria/resolve a conversa isolada antes de tocar na memória Mastra.
        const botId = localStorage.getItem("nullain-active-bot-id") || undefined;
        let botConversationId = botId
          ? localStorage.getItem("nullain-active-bot-conversation-id")
          : null;
        if (botId && !botConversationId) {
          botConversationId = crypto.randomUUID();
          localStorage.setItem("nullain-active-bot-conversation-id", botConversationId);
        }
        return {
          body: {
            messages,
            model,
            computer: loadComputer(),
            integrations: loadIntegrations(),
            generation: loadGeneration(),
            generationMode: loadGenerationMode(),
            disabledSkills: loadDisabledSkills(),
            botId,
            botConversationId: botConversationId ?? undefined,
            config: {
              modelName: model,
              reasoningEffort: loadEffort(),
            },
          },
          headers: {
            "x-thread-id": threadId,
            ...(isIntegrationConsumerKey(integrationKey)
              ? { "x-nullain-integration-key": integrationKey }
              : {}),
          },
        };
      },
    }),
  });
  const loadedTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!transcriptTarget) return;
    const key = `${transcriptTarget.botId}:${transcriptTarget.conversationId}`;
    if (loadedTarget.current === key) return;
    loadedTarget.current = key;
    let current = true;
    runtime.thread.cancelRun();
    void loadBotTranscript(transcriptTarget)
      .then((messages) => {
        if (current) runtime.thread.importExternalState({ messages });
      })
      .catch(console.error);
    return () => {
      current = false;
    };
  }, [runtime, transcriptTarget]);
  useEffect(() => {
    if (!transcriptTarget) return;
    let current = true;
    let sawActiveRun = false;
    let attempts = 0;
    let before: number | undefined;
    const rememberCursor = (snapshot: { messages: unknown[]; nextCursor?: number | null }) => {
      const first = snapshot.messages[0] as { metadata?: unknown } | undefined;
      const cursor =
        snapshot.nextCursor ??
        (first?.metadata as { nullainSequence?: unknown } | undefined)?.nullainSequence;
      before = typeof cursor === "number" ? cursor : undefined;
    };
    const loadOlder = async () => {
      if (before === undefined || !current) return;
      try {
        const page = await readBotTranscript(transcriptTarget, before);
        if (!current) return;
        rememberCursor(page);
        runtime.thread.importExternalState({ messages: page.messages, append: true });
      } catch (error) {
        console.error(error);
      }
    };
    const onLoadOlder = () => void loadOlder();
    const dispatchActiveRun = (run: { id: string; status: "queued" | "running" } | null) => {
      window.dispatchEvent(
        new CustomEvent("nullain-transcript-active-run", {
          detail: run
            ? {
                botId: transcriptTarget.botId,
                conversationId: transcriptTarget.conversationId,
                runId: run.id,
              }
            : null,
        }),
      );
    };
    const synchronize = async () => {
      if (!current || document.visibilityState === "hidden" || attempts >= 120) return;
      attempts += 1;
      const snapshot = await readBotTranscript(transcriptTarget);
      if (!current) return;
      rememberCursor(snapshot);
      dispatchActiveRun(snapshot.activeRun);
      if (snapshot.activeRun) {
        sawActiveRun = true;
        return;
      }
      if (sawActiveRun) {
        runtime.thread.importExternalState({ messages: snapshot.messages });
        sawActiveRun = false;
      }
    };
    const refresh = () =>
      readBotTranscript(transcriptTarget)
        .then((snapshot) => {
          if (current) {
            rememberCursor(snapshot);
            dispatchActiveRun(snapshot.activeRun);
            runtime.thread.importExternalState({ messages: snapshot.messages });
          }
        })
        .catch(console.error);
    void synchronize().catch(console.error);
    const interval = window.setInterval(() => void synchronize().catch(console.error), 3_000);
    window.addEventListener("nullain-transcript-refresh", refresh);
    window.addEventListener("nullain-transcript-load-older", onLoadOlder);
    return () => {
      current = false;
      window.clearInterval(interval);
      window.removeEventListener("nullain-transcript-refresh", refresh);
      window.removeEventListener("nullain-transcript-load-older", onLoadOlder);
    };
  }, [runtime, transcriptTarget]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ActiveBotProvider>
        {/* Registra a tool UI do computador (inline na thread) — Inversão FASE 5. */}
        <ComputerToolUI />
        <SkillCreatorToolUI />
        <BotReviewDataUI />
        <BotCreatedDataUI />
        <SkillSelectionProvider>
          <div className="nullain-stage relative h-svh w-full overflow-hidden p-0 md:p-4 xl:p-7">
            {/* Um único frame reúne navegação, trabalho e computador. Em telas
            pequenas ele volta a ocupar o viewport inteiro. */}
            <div className="nullain-app-frame flex h-full w-full overflow-hidden border-foreground/8 bg-background md:rounded-[1.5rem] md:border">
              <ThreadListSidebar />
              <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {children}
              </main>
              {pathname !== "/plugins" &&
                pathname !== "/skills" &&
                !pathname.startsWith("/code") && <ComputerSidebar />}
            </div>
          </div>
        </SkillSelectionProvider>
      </ActiveBotProvider>
    </AssistantRuntimeProvider>
  );
};
