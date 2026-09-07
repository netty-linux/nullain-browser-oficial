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
