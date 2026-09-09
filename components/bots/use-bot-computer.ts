"use client";

import { useBotTranscriptTarget } from "@/lib/bot-transcript-history";
import { useActiveBotIdentity } from "./bot-avatar";

export type BotComputerTarget = {
  /** Id estável da sessão visual local. */
  computerId: string;
  /** Raiz completa do proxy deste computador. */
  basePath: string;
  /** Nome exibido no tile. */
  name: string;
  provider: "local";
};

/**
 * Resolve qual computador a UI opera para o bot ativo.
 *
 * O alvo é derivado exclusivamente do transcript autenticado. O navegador não
 * fornece owner, bot ou conversa confiáveis e não há fallback para OpenBot.
 *
 * `ready` é false enquanto a identidade/vínculo carrega — executores de tool
 * one-shot devem esperar por ele antes de disparar a única chamada.
 */
export function useBotComputerTarget(): {
  ready: boolean;
  target: BotComputerTarget;
} {
  const activeBot = useActiveBotIdentity();
  const transcript = useBotTranscriptTarget();
  const localEnabled = process.env.NEXT_PUBLIC_NULLAIN_LOCAL_COMPUTER !== "0";

  if (localEnabled && transcript && activeBot?.id === transcript.botId) {
    return {
      ready: true,
      target: {
        computerId: transcript.conversationId,
        basePath: `/api/bots/${encodeURIComponent(transcript.botId)}/conversations/${encodeURIComponent(transcript.conversationId)}/computer`,
        name: activeBot.name,
        provider: "local",
      },
    };
  }

  const target: BotComputerTarget = {
    computerId: "unavailable",
    basePath: "/api/computer-unavailable",
    name: activeBot?.name ?? "Nullain",
    provider: "local",
  };
  return { ready: false, target };
}
