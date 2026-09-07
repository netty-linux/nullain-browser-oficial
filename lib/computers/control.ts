import { tryClient } from "./client";

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

async function callControl(
  computerId: string,
  path: string,
  method?: string,
): Promise<ControlState | null> {
  const response = await tryClient(`/api/computers/${computerId}${path}`, method ? { method } : {});
  if (!response.ok) return null;
  return (await response.json()) as ControlState;
}

export function readControl(computerId: string) {
  return callControl(computerId, "/control");
}

export function takeControl(computerId: string) {
  return callControl(computerId, "/control/take", "POST");
}

export function releaseControl(computerId: string) {
  return callControl(computerId, "/control/release", "POST");
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
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await tryClient(`/api/computers/${computerId}/human/secret`, {
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
): void {
  inputQueue = inputQueue
    .then(() =>
      tryClient(`/api/computers/${computerId}/human/${kind}`, {
        method: "POST",
        body,
      }),
    )
    .catch(() => undefined);
}
