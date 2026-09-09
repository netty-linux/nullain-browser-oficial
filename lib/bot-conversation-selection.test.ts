import { describe, expect, it } from "vitest";
import {
  selectBotConversationForThread,
  startNewBotConversation,
} from "./bot-conversation-selection";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("bot conversation selection", () => {
  it("isola uma nova conversa e a vincula à thread quando ela é inicializada", () => {
    const storage = new MemoryStorage();
    storage.setItem("nullain-active-bot-id", "bot-1");
    expect(startNewBotConversation(storage, "conversation-new")).toBe("conversation-new");
    expect(selectBotConversationForThread(storage, "thread-2")).toBe("conversation-new");
  });

  it("restaura conversas diferentes ao alternar threads", () => {
    const storage = new MemoryStorage();
    storage.setItem("nullain-active-bot-id", "bot-1");
    startNewBotConversation(storage, "conversation-1");
    selectBotConversationForThread(storage, "thread-1");
    startNewBotConversation(storage, "conversation-2");
    selectBotConversationForThread(storage, "thread-2");
    expect(selectBotConversationForThread(storage, "thread-1")).toBe("conversation-1");
    expect(storage.getItem("nullain-active-bot-conversation-id")).toBe("conversation-1");
  });
});
