import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nullain-bot-link-"));
vi.stubEnv("NULLAIN_AUTH_SECRET", "test-secret-with-at-least-thirty-two-characters");
vi.stubEnv("NULLAIN_APP_DB_PATH", path.join(directory, "app.db"));
vi.stubEnv("NULLAIN_BOT_COMPUTER", "1");
import {
  clearBotOpenBotLink,
  getBotOpenBotLink,
  isBotComputerLinkEnabled,
  setBotOpenBotLink,
} from "./bot-openbot-link";
import {
  createBotDraft,
  createBotFromDraft,
  ensureSystemBot,
  reviewBotDraft,
} from "./bot-runtime-repository";
import { getNullainDatabase, migrateNullainDatabase } from "./nullain-db";

beforeAll(() => {
  const db = getNullainDatabase();
  migrateNullainDatabase(db);
  db.prepare(
    'INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)',
  ).run("a", "A", "a@test", Date.now(), Date.now());
});

afterAll(() => {
  getNullainDatabase().close();
  delete (globalThis as typeof globalThis & { __nullainAppDatabase?: unknown })
    .__nullainAppDatabase;
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

function bot(owner: string, name: string) {
  const draft = createBotDraft(owner, { objective: "Linked bot" });
  const reviewed = reviewBotDraft(owner, draft.id, {
    revision: draft.revision,
    name,
    description: "Linked",
    instructions: "Help safely.",
    modelId: "ollama-cloud/gpt-oss:20b",
    avatarColorToken: draft.avatarColorToken,
  });
  return createBotFromDraft(owner, draft.id, reviewed.revision);
}

describe("bot OpenBot link", () => {
  it("is gated by the feature flag and isolated per owner", () => {
    expect(isBotComputerLinkEnabled()).toBe(true);
    const created = bot("a", "Linked");
    expect(getBotOpenBotLink("a", created.id)).toBeNull();
    const link = setBotOpenBotLink("a", created.id, "agent_123");
    expect(link).toMatchObject({ botId: created.id, openbotAgentId: "agent_123" });
    expect(getBotOpenBotLink("a", created.id)?.openbotAgentId).toBe("agent_123");
    expect(() => setBotOpenBotLink("a", created.id, "../evil")).toThrow(/inválido/);
    expect(() => getBotOpenBotLink("b", created.id)).toThrow();
    const system = ensureSystemBot("a");
    expect(() => setBotOpenBotLink("a", system.id, "agent_123")).toThrow(/principal/);
    clearBotOpenBotLink("a", created.id);
    expect(getBotOpenBotLink("a", created.id)).toBeNull();
  });
});
