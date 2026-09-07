import { isSupportedImageMediaType } from "../model-catalog";

type MessageLike = {
  role?: unknown;
  parts?: unknown;
  content?: unknown;
};

type PartLike = {
  type?: unknown;
  image?: unknown;
  url?: unknown;
  data?: unknown;
  mediaType?: unknown;
  mimeType?: unknown;
};

export type MessagePruneStats = {
  droppedImageParts: number;
  droppedEmptyAssistant: number;
};

function getMessageParts(message: MessageLike): unknown[] | undefined {
  if (Array.isArray(message.parts)) return message.parts;
  if (
    message.content &&
    typeof message.content === "object" &&
    Array.isArray((message.content as { parts?: unknown }).parts)
  ) {
    return (message.content as { parts: unknown[] }).parts;
  }
  return undefined;
}

function replaceMessageParts(message: MessageLike, parts: unknown[]): MessageLike {
  if (Array.isArray(message.parts)) return { ...message, parts };
  if (message.content && typeof message.content === "object") {
    return { ...message, content: { ...message.content, parts } };
  }
  return message;
}

function dataUrlMediaType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^data:([^;,]+)[;,]/i.exec(value)?.[1]?.toLowerCase();
}

function isImagePart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const candidate = part as PartLike;
  if (candidate.type === "image") return true;
  if (candidate.type !== "file") return false;
  const value = candidate.url ?? candidate.data;
  const mediaType =
    dataUrlMediaType(value) ??
    (typeof candidate.mediaType === "string" ? candidate.mediaType : candidate.mimeType);
  return typeof mediaType === "string" && mediaType.toLowerCase().startsWith("image/");
}

export function getSupportedImageDataUrl(part: unknown): string | undefined {
  if (!part || typeof part !== "object") return undefined;
  const candidate = part as PartLike;
  const value =
    candidate.type === "image"
      ? candidate.image
      : candidate.type === "file"
        ? (candidate.url ?? candidate.data)
        : undefined;
  if (typeof value !== "string") return undefined;

  const mediaType =
    dataUrlMediaType(value) ??
    (typeof candidate.mediaType === "string" ? candidate.mediaType : candidate.mimeType);
  return isSupportedImageMediaType(mediaType) && value.startsWith("data:") ? value : undefined;
}

export function hasLatestUserImage(messages: unknown[]): boolean {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as MessageLike | undefined;
    if (message?.role !== "user") continue;
    return (
      getMessageParts(message)?.some((part) => getSupportedImageDataUrl(part) !== undefined) ??
      false
    );
  }
  return false;
}

export function getLatestUserImageDataUrl(messages: unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as MessageLike | undefined;
    if (message?.role !== "user") continue;
    const parts = getMessageParts(message) ?? [];
    for (const part of parts) {
      const image = getSupportedImageDataUrl(part);
      if (image) return image;
    }
    return null;
  }
  return null;
}

/**
 * Mantém imagens somente na mensagem atual e apenas quando o modelo selecionado
 * é multimodal. Imagens antigas continuam sendo removidas para não multiplicar
 * base64 no histórico persistido e no payload enviado ao provider.
 */
export function pruneMessageHistory(
  messages: unknown[],
  { keepLatestUserImages }: { keepLatestUserImages: boolean },
): { messages: unknown[]; stats: MessagePruneStats } {
  let droppedImageParts = 0;
  let droppedEmptyAssistant = 0;
  let latestUserIndex = -1;

  for (let index = messages.length - 1; index >= 0; index--) {
    if ((messages[index] as MessageLike | undefined)?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  const pruned = messages
    .filter((raw) => {
      const message = raw as MessageLike | undefined;
      if (!message) return false;
      if (message.role !== "assistant") return true;
      const keep = (getMessageParts(message)?.length ?? 0) > 0;
      if (!keep) droppedEmptyAssistant++;
      return keep;
    })
    .map((raw) => {
      const message = raw as MessageLike;
      const parts = getMessageParts(message);
      if (message.role !== "user" || !parts) return message;

      // O índice pode mudar se uma resposta vazia anterior foi filtrada. Para
      // identificar a mensagem atual com segurança, compara a própria referência.
      const isLatestUserMessage = raw === messages[latestUserIndex];
      const kept = parts.filter((part) => {
        if (!isImagePart(part)) return true;
        if (keepLatestUserImages && isLatestUserMessage) return true;
        droppedImageParts++;
        return false;
      });

      if (kept.length === parts.length) return message;
      if (!kept.some((part) => (part as PartLike | undefined)?.type === "text")) {
        kept.push({ type: "text", text: "[imagem anterior omitida]" });
      }
      return replaceMessageParts(message, kept);
    });

  return { messages: pruned, stats: { droppedImageParts, droppedEmptyAssistant } };
}
