export const PINNED_THREAD_IDS_STORAGE_KEY = "nullain:pinned-thread-ids:v1";

const MAX_PINNED_THREADS = 200;
const MAX_STORAGE_LENGTH = 64 * 1024;
const MAX_THREAD_ID_LENGTH = 512;

const normalizeThreadId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const threadId = value.trim();
  if (!threadId || threadId.length > MAX_THREAD_ID_LENGTH) return null;
  return threadId;
};

const normalizePinnedThreadIds = (values: Iterable<unknown>): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const threadId = normalizeThreadId(value);
    if (!threadId || seen.has(threadId)) continue;

    seen.add(threadId);
    normalized.push(threadId);
    if (normalized.length === MAX_PINNED_THREADS) break;
  }

  return normalized;
};

export const parsePinnedThreadIds = (raw: string | null): string[] => {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return [];

  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? normalizePinnedThreadIds(value) : [];
  } catch {
    return [];
  }
};

export const serializePinnedThreadIds = (threadIds: Iterable<unknown>): string =>
  JSON.stringify(normalizePinnedThreadIds(threadIds));

export const updatePinnedThreadIds = (
  threadIds: Iterable<unknown>,
  threadId: string,
  pinned: boolean,
): string[] => {
  const normalizedId = normalizeThreadId(threadId);
  const current = normalizePinnedThreadIds(threadIds);
  if (!normalizedId) return current;

  const withoutThread = current.filter((id) => id !== normalizedId);
  return pinned ? normalizePinnedThreadIds([normalizedId, ...withoutThread]) : withoutThread;
};
