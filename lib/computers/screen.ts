import { tryClient } from "./client";

/**
 * Um frame da tela do Bot. Polling (não cacheado): cada leitura é um frame
 * do momento, nunca uma cópia guardada.
 */
export type Screenshot = {
  base64: string;
  width: number;
  height: number;
  capturedAt: string;
  /** `about:blank` quando o browser ainda não abriu nada. Ausente em computadores antigos. */
  url?: string;
};

/**
 * Lê o frame atual. Falha fechada, explicando por quê: a tela indisponível é
 * uma informação que quem observa precisa saber, não motivo para derrubar o
 * painel. O chamado decide se continua no polling.
 */
export async function readScreenshot(
  computerId: string,
): Promise<{ frame?: Screenshot; error?: string }> {
  const unavailable = "The screen is not available right now.";
  try {
    const response = await tryClient(`/api/computers/${computerId}/screenshot`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { error: body?.error ?? unavailable };
    }
    return { frame: (await response.json()) as Screenshot };
  } catch {
    return { error: unavailable };
  }
}

/** O frame que uma página tinha quando um Bot a abriu. */
export type PageFrame = { url: string; title: string | null; frame: string };

/**
 * O que este turno tinha na tela quando abriu a página, ou nada se nunca foi
 * gravado. Só leitura — o frame é capturado no servidor no momento da
 * navegação.
 */
export async function readPageFrame(
  computerId: string,
  toolCallId: string,
): Promise<PageFrame | null> {
  try {
    const response = await tryClient(
      `/api/computers/${computerId}/page-frame/${encodeURIComponent(toolCallId)}`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { frame?: PageFrame | null };
    return body.frame ?? null;
  } catch {
    return null;
  }
}
