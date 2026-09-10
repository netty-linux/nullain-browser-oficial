const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");

export const matchesThreadTitle = (title: string | undefined, query: string): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  return normalizeSearchText(title ?? "Nova conversa").includes(normalizedQuery);
};

/** Casa texto livre (nome/descrição de bot, trechos de mensagem) sem acento/caixa. */
export const matchesSearchText = (haystack: string | undefined, query: string): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  return normalizeSearchText(haystack ?? "").includes(normalizedQuery);
};

/** Bot da equipe casa por nome ou descrição. */
export const matchesBotProfile = (
  bot: { name?: string; description?: string },
  query: string,
): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  return (
    normalizeSearchText(bot.name ?? "").includes(normalizedQuery) ||
    normalizeSearchText(bot.description ?? "").includes(normalizedQuery)
  );
};

const collectMessageTexts = (value: unknown, out: string[]): void => {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMessageTexts(item, out);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") out.push(record.text);
    for (const key of ["content", "parts", "messages"]) {
      if (key in record) collectMessageTexts(record[key], out);
    }
  }
};

/**
 * Casa uma thread pelo título OU pelo conteúdo das mensagens, quando o
 * adapter expõe `messages` no item. Itens sem mensagens caem no título.
 */
export const matchesThreadItem = (
  thread: { title?: string; messages?: unknown } & Record<string, unknown>,
  query: string,
): boolean => {
  if (matchesThreadTitle(thread.title, query)) return true;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  const texts: string[] = [];
  collectMessageTexts(thread.messages, texts);
  return texts.some((text) => normalizeSearchText(text).includes(normalizedQuery));
};
