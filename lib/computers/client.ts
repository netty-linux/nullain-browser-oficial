/**
 * Cliente de computador da Nullain → OpenBot (Inversão FASE 5).
 *
 * Fala com `/api/computers/*` na MESMA origem (a UI Nullain). O route handler
 * `app/api/computers/[...path]` repassa para o servidor do OpenBot preservando
 * o cookie de sessão — então aqui usamos `credentials: "include"` e paths
 * relativos, igual ao `tryClient` original do OpenBot, sem base URL explícita.
 */

export type ClientOptions = {
  method?: string;
  body?: unknown;
  fallback?: string;
  signal?: AbortSignal;
};

/** Request autenticado (cookie), JSON ou nada. */
async function send(path: string, options: ClientOptions): Promise<Response> {
  return fetch(path, {
    method: options.method,
    credentials: "include",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function tryClient(path: string, options: ClientOptions = {}): Promise<Response> {
  return send(path, options);
}

/**
 * Monta a URL de um endpoint de computador.
 *
 * Sem `basePath`, usa o proxy legado e inclui o id do computador. Quando um
 * `basePath` é informado, ele já representa a raiz completa do computador.
 * Isso permite ao proxy governado `/api/bots/:botId/computer` resolver o agente
 * no servidor sem receber o id do OpenBot como parte autoritativa da rota.
 */
export function computerUrl(computerId: string, rest: string, basePath?: string): string {
  const root = basePath ?? `/api/computers/${encodeURIComponent(computerId)}`;
  return `${root}${rest}`;
}
