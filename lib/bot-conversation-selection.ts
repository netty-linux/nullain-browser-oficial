const ACTIVE_BOT = "nullain-active-bot-id";
const ACTIVE_CONVERSATION = "nullain-active-bot-conversation-id";
const PENDING_THREAD = "nullain-pending-bot-conversation-id";

type ConversationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const mappingKey = (botId: string, threadId: string) =>
  `nullain-bot-thread:${encodeURIComponent(botId)}:${encodeURIComponent(threadId)}`;

export function startNewBotConversation(
  storage: ConversationStorage,
  id = crypto.randomUUID(),
): string | null {
  if (!storage.getItem(ACTIVE_BOT)) return null;
  storage.setItem(ACTIVE_CONVERSATION, id);
  storage.setItem(PENDING_THREAD, id);
  return id;
}

export function selectBotConversationForThread(
  storage: ConversationStorage,
  threadId: string,
  createId = () => crypto.randomUUID(),
): string | null {
  const botId = storage.getItem(ACTIVE_BOT);
  if (!botId) return null;
  const key = mappingKey(botId, threadId);
  let conversationId = storage.getItem(key);
  if (!conversationId) {
    conversationId = storage.getItem(PENDING_THREAD) ?? createId();
    storage.setItem(key, conversationId);
  }
  storage.removeItem(PENDING_THREAD);
  storage.setItem(ACTIVE_CONVERSATION, conversationId);
  return conversationId;
}
