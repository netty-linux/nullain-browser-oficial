"use client";

/**
 * MessageSources — fontes citadas no final da resposta do assistente.
 *
 * Extrai as URLs do markdown da mensagem (links [texto](url)) e renderiza
 * chips do prompt-kit Source: favicon + domínio, com hover card mostrando
 * título e descrição. Deduplicado por domínio (uma fonte = um chip).
 *
 * Renderizado sempre no final da AssistantMessage, acompanhando a resposta.
 */

import { useAuiState } from "@assistant-ui/react";
import { useMemo, type FC } from "react";
import { GlobeIcon } from "lucide-react";
import { Source, SourceContent, SourceTrigger } from "@/components/prompt-kit/source";

/** Domínios que não são fontes de conteúdo (links de ação/ancoragem). */
const EXCLUDED_HOSTS = new Set(["localhost", "127.0.0.1", "connect.composio.dev"]);

type SourceInfo = {
  href: string;
  domain: string;
  title: string;
};

/** Extrai o domínio de forma segura. */
function domainOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Coleta as URLs da mensagem a partir das parts (texto markdown + resultados
 * de tools). Retorna fontes deduplicadas por URL completa, na ordem em que
 * aparecem.
 */
function useMessageSources(): SourceInfo[] {
  // String estável (useSyncExternalStore exige snapshot por valor): todas as
  // URLs concatenadas com um separador que não aparece em URL.
  const encoded = useAuiState((s) => {
    const parts = s.message.parts ?? [];
    const urls: string[] = [];
    for (const part of parts) {
      const p = part as { type?: string; text?: string; content?: string };
      const text =
        p?.type === "text"
          ? (p.text ?? "")
          : p?.type === "tool-call"
            ? typeof p.content === "string"
              ? p.content
              : ""
            : "";
      if (!text) continue;
      // Links markdown [label](url) — a forma como o agente cita fontes.
      const re = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const url = m[2];
        if (!urls.includes(url)) urls.push(url);
      }
    }
    return urls.join("\u0001");
  });

  return useMemo(() => {
    if (!encoded) return [];
    const out: SourceInfo[] = [];
    for (const href of encoded.split("\u0001")) {
      const domain = domainOf(href);
      if (!domain) continue;
      if (EXCLUDED_HOSTS.has(domain)) continue;
      if (out.some((s) => s.href === href)) continue;
      out.push({
        href,
        domain,
        title: domain, // o hover mostra o domínio como título (sem fetch extra)
      });
    }
    return out;
  }, [encoded]);
}

/** A barra de fontes — renderizada no final da AssistantMessage. */
export const MessageSources: FC = () => {
  const sources = useMessageSources();
  if (sources.length === 0) return null;

  return (
    <div
      data-slot="aui-message-sources"
      className="text-muted-foreground mt-3 ms-12 flex items-start gap-1.5"
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <GlobeIcon className="size-3.5 shrink-0" />
        <span className="text-xs font-medium">Fontes</span>
      </span>
      {/* Grid de colunas uniformes: cada chip ocupa a MESMA largura de coluna,
          então todas as fileiras alinham entre si (sem borda irregular). */}
      <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
        {sources.map((s) => (
          <Source key={s.href} href={s.href}>
            <SourceTrigger showFavicon />
            <SourceContent title={s.title} description={s.href} />
          </Source>
        ))}
      </div>
    </div>
  );
};
