"use client";

import { type FC } from "react";
import { ImageIcon, VideoIcon } from "lucide-react";
import { useAssistantToolUI, type ToolCallMessagePartComponent } from "@assistant-ui/react";

/**
 * Renderer de mídia gerada (imagem/vídeo via WaveSpeed) no chat.
 *
 * Em vez de mostrar só o link no ToolFallbackResult, exibe a mídia INLINE:
 * - generate_image → <img> com a URL gerada.
 * - generate_video → <video controls> com a URL gerada.
 *
 * O tool result tem o formato { ok: boolean, urls?: string[], error?: string }.
 */

function parseResult(result: unknown): { urls: string[]; error?: string } {
  if (!result || typeof result !== "object") return { urls: [] };
  const r = result as { ok?: boolean; urls?: unknown; error?: unknown };
  const urls = Array.isArray(r.urls)
    ? r.urls.filter((u): u is string => typeof u === "string")
    : [];
  const error = typeof r.error === "string" ? r.error : undefined;
  return { urls, error };
}

const GenerationImageRenderer: ToolCallMessagePartComponent = ({ result, status }) => {
  const { urls, error } = parseResult(result);
  const running = status?.type === "running";

  if (running) {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-700 dark:text-fuchsia-300">
        <ImageIcon className="size-3 animate-pulse" />
        <span>gerando imagem…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
        <ImageIcon className="size-3" />
        <span>imagem falhou: {error}</span>
      </div>
    );
  }

  if (!urls.length) return null;

  return (
    <div className="my-2 flex flex-wrap gap-2">
      {urls.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-lg border border-border/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Imagem gerada"
            className="max-h-72 w-auto max-w-full object-contain transition-opacity group-hover:opacity-90"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
};

const GenerationVideoRenderer: ToolCallMessagePartComponent = ({ result, status }) => {
  const { urls, error } = parseResult(result);
  const running = status?.type === "running";

  if (running) {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-700 dark:text-fuchsia-300">
        <VideoIcon className="size-3 animate-pulse" />
        <span>gerando vídeo…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
        <VideoIcon className="size-3" />
        <span>vídeo falhou: {error}</span>
      </div>
    );
  }

  if (!urls.length) return null;

  return (
    <div className="my-2 flex flex-wrap gap-2">
      {urls.map((url) => (
        <video
          key={url}
          src={url}
          controls
          playsInline
          preload="auto"
          className="max-h-72 w-auto max-w-full rounded-lg border border-border/60 bg-black/5"
        >
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
            Abrir vídeo
          </a>
        </video>
      ))}
    </div>
  );
};

/**
 * Registra os renderers para generate_image e generate_video enquanto montado.
 * Renderizado uma vez por AssistantMessage.
 *
 * display: "standalone" — a mídia É o resultado visível: renderiza inline na
 * mensagem, fora do bloco de atividade colapsável (ActivityBlock).
 */
export const GenerationMedia: FC = () => {
  useAssistantToolUI({
    toolName: "generate_image",
    render: GenerationImageRenderer,
    display: "standalone",
  });
  useAssistantToolUI({
    toolName: "generate_video",
    render: GenerationVideoRenderer,
    display: "standalone",
  });
  return null;
};
