import { computerUrl, tryClient } from "./client";

/**
 * Dar/retomar o volante do computador de um Bot.
 *
 * Funções puras, todas falham fechadas e nada é cacheado: quem segura o volante
 * é um fato do segundo presente, e uma cópia velha disso seria pior que nenhuma.
 *
 * Leituras respondem `null` em falha em vez de lançar: um painel que não sabe
 * dizer quem dirige deve ficar calado, não derrubar a tela que a pessoa observa.
 */

export type ControlState = {
  holder: "bot" | "human";
  since: string;
  reason?: string;
  requested: boolean;
  /** O que o Bot espera, só o nome. Presente mostra o prompt mascarado. */
  secretWanted?: string;
};

type ControlOptions = {
  /** Proxy do computador. Default: legado `/api/computers`. */
  basePath?: string;
};

async function callControl(
  computerId: string,
  path: string,
  method?: string,
  options: ControlOptions = {},
): Promise<ControlState | null> {
  const response = await tryClient(
    computerUrl(computerId, path, options.basePath),
    method ? { method } : {},
  );
  if (!response.ok) return null;
  return (await response.json()) as ControlState;
}

export function readControl(computerId: string, options: ControlOptions = {}) {
  return callControl(computerId, "/control", undefined, options);
}

export function takeControl(computerId: string, options: ControlOptions = {}) {
  return callControl(computerId, "/control/take", "POST", options);
}

export function releaseControl(computerId: string, options: ControlOptions = {}) {
  return callControl(computerId, "/control/release", "POST", options);
}

/**
 * Envia um segredo sincronamente e NUNCA ecoa o valor de volta à UI.
 *
 * A única chamada aqui que explica por que falhou, porque uma pessoa espera a
 * resposta e uma falha silenciosa a deixaria digitando em algo surdo.
 */
export async function supplySecret(
  computerId: string,
  text: string,
  options: ControlOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await tryClient(computerUrl(computerId, "/human/secret", options.basePath), {
      method: "POST",
      body: { text },
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return { ok: false, error: body?.error ?? "That could not be entered." };
  } catch {
    return {
      ok: false,
      error: "The assistant's computer could not be reached.",
    };
  }
}

/**
 * Serializa entradas humanas sem bloquear o chamador; a ordenação importa
 * para segredos digitados.
 */
let inputQueue: Promise<unknown> = Promise.resolve();

export function sendHumanInput(
  computerId: string,
  kind: "click" | "type" | "key" | "scroll",
  body: Record<string, unknown>,
  options: ControlOptions = {},
): void {
  inputQueue = inputQueue
    .then(() =>
      tryClient(computerUrl(computerId, `/human/${kind}`, options.basePath), {
        method: "POST",
        body,
      }),
    )
    .catch(() => undefined);
}
