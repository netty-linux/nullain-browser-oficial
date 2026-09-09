"use client";

import type {
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  ThreadHistoryAdapter,
} from "@assistant-ui/react";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";

type TranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  sequence: number;
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
  publicError: string | null;
};

function toUIParts(message: TranscriptMessage): UIMessage["parts"] {
  const result: UIMessage["parts"] = [];
  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string")
      result.push({ type: "text", text: part.text });
    else if (part.type === "bot-review" || part.type === "bot-created")
      result.push({ type: `data-${part.type}`, data: part });
  }
  return result;
}

export type BotTranscriptTarget = {
  botId: string;
  clientConversationId: string;
  conversationId: string;
};

export type BotComputerLinkState = {
  enabled: boolean;
  openbotAgentId: string | null;
};

function readSelection() {
  const botId = localStorage.getItem("nullain-active-bot-id");
  const clientConversationId = localStorage.getItem("nullain-active-bot-conversation-id");
  return botId && clientConversationId ? { botId, clientConversationId } : null;
}

export function useBotTranscriptTarget() {
  const [target, setTarget] = useState<BotTranscriptTarget | null>(null);
  useEffect(() => {
    let generation = 0;
    const resolve = async () => {
      const selection = readSelection();
      const current = ++generation;
      if (!selection) return setTarget(null);
      const response = await fetch(
        `/api/bots/${encodeURIComponent(selection.botId)}/conversations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientConversationId: selection.clientConversationId }),
        },
      );
      if (!response.ok) throw new Error("Não foi possível abrir a conversa do bot.");
      const body = (await response.json()) as { conversation: { id: string } };
      if (current === generation) setTarget({ ...selection, conversationId: body.conversation.id });
    };
    void resolve().catch(console.error);
    window.addEventListener("nullain-bot-changed", resolve);
    return () => {
      generation += 1;
      window.removeEventListener("nullain-bot-changed", resolve);
    };
  }, []);
  return target;
}

export async function loadBotTranscript(target: BotTranscriptTarget): Promise<UIMessage[]> {
  return (await readBotTranscript(target)).messages;
}

export async function readBotTranscript(
  target: BotTranscriptTarget,
  before?: number,
): Promise<{
  messages: UIMessage[];
  activeRun: { id: string; status: "queued" | "running" } | null;
  nextCursor: number | null;
}> {
  const query = new URLSearchParams({ limit: "100" });
  if (before !== undefined) query.set("before", String(before));
  const response = await fetch(
    `/api/bots/${encodeURIComponent(target.botId)}/conversations/${encodeURIComponent(target.conversationId)}/transcript?${query}`,
  );
  if (!response.ok) throw new Error("Não foi possível carregar o histórico do bot.");
  const body = (await response.json()) as {
    messages: TranscriptMessage[];
    activeRun: { id: string; status: "queued" | "running" } | null;
    nextCursor?: number | null;
  };
  return {
    activeRun: body.activeRun,
    nextCursor: body.nextCursor ?? null,
    messages: body.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: toUIParts(message),
      metadata: {
        nullainTranscriptStatus: message.status,
        nullainSequence: message.sequence,
        ...(message.publicError ? { nullainPublicError: message.publicError } : {}),
      },
    })),
  };
}

export type BotRunTarget = { botId: string; conversationId: string };

export async function cancelBotTranscriptRun(target: BotRunTarget, runId: string): Promise<void> {
  const response = await fetch(
    `/api/bots/${encodeURIComponent(target.botId)}/conversations/${encodeURIComponent(target.conversationId)}/runs/${encodeURIComponent(runId)}/cancel?action=cancel`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Não foi possível cancelar a execução.");
  }
}

export async function readBotComputerLink(botId: string): Promise<BotComputerLinkState> {
  const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/computer`);
  if (!response.ok) throw new Error("Não foi possível carregar o vínculo do computador.");
  const body = (await response.json()) as {
    enabled: boolean;
    link: { openbotAgentId: string } | null;
  };
  return { enabled: body.enabled, openbotAgentId: body.link?.openbotAgentId ?? null };
}

export async function saveBotComputerLink(botId: string, openbotAgentId: string): Promise<void> {
  const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/computer`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ openbotAgentId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Não foi possível vincular o computador.");
  }
}

export async function clearBotComputerLink(botId: string): Promise<void> {
  const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/computer`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Não foi possível desvincular o computador.");
  }
}

export function useBotThreadHistoryAdapter(target: BotTranscriptTarget | null) {
  return useMemo<ThreadHistoryAdapter | undefined>(() => {
    if (!target) return undefined;
    return {
      async load() {
        return { headId: null, messages: [] };
      },
      async append() {},
      withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
        format: MessageFormatAdapter<TMessage, TStorageFormat>,
      ): GenericThreadHistoryAdapter<TMessage> {
        return {
          async load() {
            const messages = await loadBotTranscript(target);
            let parentId: string | null = null;
            const decoded = messages.map((message) => {
              const item = { parentId, message: message as TMessage };
              const content = format.encode(item);
              const result = format.decode({
                id: message.id,
                parent_id: parentId,
                format: format.format,
                content,
              });
              parentId = message.id;
              return result;
            });
            return { headId: parentId, messages: decoded };
          },
          async append() {
            // O lifecycle server-side já persiste user e assistant antes/depois do run.
          },
          async update() {},
        };
      },
    };
  }, [target]);
}
