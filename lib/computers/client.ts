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
