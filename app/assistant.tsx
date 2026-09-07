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

export const AssistantShell = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const pathname = usePathname();
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    adapters: {
      attachments: compressedImageAttachmentAdapter,
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
        return {
          body: {
            messages,
            model,
            computer: loadComputer(),
            integrations: loadIntegrations(),
            generation: loadGeneration(),
            generationMode: loadGenerationMode(),
            disabledSkills: loadDisabledSkills(),
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Registra a tool UI do computador (inline na thread) — Inversão FASE 5. */}
      <ComputerToolUI />
      <div className="nullain-stage relative h-svh w-full overflow-hidden p-0 md:p-4 xl:p-7">
        {/* Um único frame reúne navegação, trabalho e computador. Em telas
            pequenas ele volta a ocupar o viewport inteiro. */}
        <div className="nullain-app-frame flex h-full w-full overflow-hidden border-foreground/8 bg-background md:rounded-[1.5rem] md:border">
          <ThreadListSidebar />
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
          {pathname !== "/plugins" && <ComputerSidebar />}
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
