type ToolCallLike = {
  type?: unknown;
  toolName?: unknown;
  args?: unknown;
  result?: unknown;
  isError?: unknown;
};

type MessageLike = { content?: readonly unknown[] };

function toolkitNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const toolkits = (value as { toolkits?: unknown }).toolkits;
  if (!Array.isArray(toolkits)) return [];

  return toolkits.flatMap((toolkit) => {
    const name =
      typeof toolkit === "string"
        ? toolkit
        : toolkit &&
            typeof toolkit === "object" &&
            typeof (toolkit as { name?: unknown }).name === "string"
          ? (toolkit as { name: string }).name
          : "";
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 64);
    return normalized ? [normalized] : [];
  });
}

function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : "";
  } catch {
    return "";
  }
}

function safeConnectionUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "connect.composio.dev" ||
      !url.pathname.startsWith("/link/")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extrai somente Connect Links oficiais de um resultado MCP. A allowlist
 * impede que conteúdo arbitrário retornado por uma tool vire um iframe.
 */
export function findPluginConnectionUrl(result: unknown): string | null {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: result, depth: 0 }];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > 6) continue;
    const direct = safeConnectionUrl(current.value);
    if (direct) return direct;

    if (typeof current.value === "string") {
      const match = current.value.match(/https:\/\/connect\.composio\.dev\/link\/[A-Za-z0-9_-]+/);
      if (match) return safeConnectionUrl(match[0]);
      const trimmed = current.value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          queue.push({ value: JSON.parse(trimmed), depth: current.depth + 1 });
        } catch {
          // Resultado textual não-JSON; nenhuma URL segura encontrada.
        }
      }
      continue;
    }

    if (!current.value || typeof current.value !== "object" || visited.has(current.value)) continue;
    visited.add(current.value);
    const entries = Array.isArray(current.value)
      ? current.value.map((entry) => ["", entry] as const)
      : Object.entries(current.value);
    entries.sort(([key]) => (/^redirect_?url$/i.test(key) ? -1 : 1));
    for (const [, entry] of entries) {
      queue.push({ value: entry, depth: current.depth + 1 });
    }
  }

  return null;
}

/**
 * Extrai apenas conexões confirmadas pelos resultados das meta-tools.
 * Um redirect OAuth ou estado pending/initiated nunca é tratado como conexão.
 */
export function findConfirmedPluginSlugs(
  messages: readonly MessageLike[],
  knownToolkits: readonly { slug: string; name: string }[] = [],
): Set<string> {
  const confirmed = new Set<string>();

  for (const message of messages) {
    for (const rawPart of message.content ?? []) {
      const part = rawPart as ToolCallLike;
      if (part.type !== "tool-call" || part.isError || typeof part.toolName !== "string") continue;

      const toolName = part.toolName.toUpperCase();
      if (
        !toolName.includes("COMPOSIO_MANAGE_CONNECTIONS") &&
        !toolName.includes("COMPOSIO_WAIT_FOR_CONNECTIONS")
      ) {
        continue;
      }

      const resultText = safeText(part.result).toLowerCase();
      if (!resultText) continue;

      const hasPendingState =
        /\b(pending|initiated|initializing|not[_ -]?connected|inactive)\b/.test(resultText);
      const hasConfirmedState =
        /\b(active|connected|connection[_ -]?active)\b/.test(resultText) ||
        /successfully connected/.test(resultText);
      if (hasPendingState || !hasConfirmedState) continue;

      const context = `${safeText(part.args)} ${resultText}`.toLowerCase();
      for (const slug of toolkitNames(part.args)) confirmed.add(slug);
      for (const plugin of knownToolkits) {
        if (context.includes(plugin.slug) || context.includes(plugin.name.toLowerCase())) {
          confirmed.add(plugin.slug);
        }
      }
    }
  }

  return confirmed;
}

/**
 * Retorna os toolkits que o usuário já tentou conectar. Diferente das
 * conexões confirmadas, esta lista serve somente para limitar as consultas de
 * status e nunca é exibida como conexão ativa.
 */
export function findRequestedPluginSlugs(messages: readonly MessageLike[]): Set<string> {
  const requested = new Set<string>();

  for (const message of messages) {
    for (const rawPart of message.content ?? []) {
      const part = rawPart as ToolCallLike;
      if (part.type !== "tool-call" || typeof part.toolName !== "string") continue;
      const toolName = part.toolName.toUpperCase();
      if (
        !toolName.includes("COMPOSIO_MANAGE_CONNECTIONS") &&
        !toolName.includes("COMPOSIO_WAIT_FOR_CONNECTIONS")
      ) {
        continue;
      }
      for (const slug of toolkitNames(part.args)) requested.add(slug);
    }
  }

  return requested;
}

/** Confirma o resultado de uma consulta individual de conexão. */
export function isPluginConnectionActive(result: unknown): boolean {
  const resultText = safeText(result).toLowerCase();
  if (!resultText) return false;
  if (/"(?:is_active|connected)"\s*:\s*true\b/.test(resultText)) return true;
  if (/\b(pending|initiated|initializing|not[_ -]?connected|inactive)\b/.test(resultText)) {
    return false;
  }
  return (
    /"(?:status|state)"\s*:\s*"(?:active|connected|connection_active)"/.test(resultText) ||
    /\b(active|connected|connection[_ -]?active)\b/.test(resultText)
  );
}

export function normalizePluginSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} .+_-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
