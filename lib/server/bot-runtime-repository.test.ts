import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nullain-bots-"));
vi.stubEnv("NULLAIN_AUTH_SECRET", "test-secret-with-at-least-thirty-two-characters");
vi.stubEnv("NULLAIN_APP_DB_PATH", path.join(directory, "app.db"));
import {
  createBotDraft,
  createBotFromDraft,
  deleteBot,
  ensureBotConversation,
  ensureSystemBot,
  findConversationDraft,
  listBots,
  listGrantedSkillNames,
  requireBot,
  resolveBotRuntime,
  reviewBotDraft,
  updateBotProfile,
} from "./bot-runtime-repository";
import { getNullainDatabase, migrateNullainDatabase } from "./nullain-db";
import { advanceBotInterview } from "./bot-interview";
beforeAll(() => {
  const db = getNullainDatabase();
  migrateNullainDatabase(db);
  const q = db.prepare(
    'INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)',
  );
  q.run("a", "A", "a@test", Date.now(), Date.now());
  q.run("b", "B", "b@test", Date.now(), Date.now());
});
afterAll(() => {
  getNullainDatabase().close();
  delete (globalThis as typeof globalThis & { __nullainAppDatabase?: unknown })
    .__nullainAppDatabase;
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});
function bot(owner: string, name: string, skills: string[] = []) {
  const d = createBotDraft(owner, { objective: "Persistent research assistant" });
  const r = reviewBotDraft(owner, d.id, {
    revision: d.revision,
    name,
    description: "Research",
    instructions: "Help safely.",
    modelId: "ollama-cloud/gpt-oss:20b",
    avatarColorToken: d.avatarColorToken,
    skillNames: skills,
  });
  return createBotFromDraft(owner, d.id, r.revision);
}
describe("Bot Runtime isolation", () => {
  it("seeds one Nullain per owner and never a default team", () => {
    ensureSystemBot("a");
    ensureSystemBot("a");
    expect(listBots("a").filter((x) => x.isSystem)).toHaveLength(1);
    expect(listBots("a")).toHaveLength(1);
    expect(listBots("b")).toHaveLength(1);
  });
  it("does not expose bots, drafts, grants or conversations across owners", () => {
    const a = bot("a", "Research A", ["skill-creator"]);
    expect(listGrantedSkillNames("a", a.id)).toEqual(["skill-creator"]);
    expect(() => listGrantedSkillNames("b", a.id)).toThrow();
    expect(() => ensureBotConversation("b", a.id, "same")).toThrow();
    expect(() => resolveBotRuntime("b", a.id, "same")).toThrow();
  });
  it("isolates two bots, skills and memory namespaces", () => {
    const one = bot("a", "One", ["skill-creator"]),
      two = bot("a", "Two", []);
    const c1 = resolveBotRuntime("a", one.id, "conversation-a"),
      c2 = resolveBotRuntime("a", two.id, "conversation-b");
    expect(c1.conversation.mastraThreadId).not.toBe(c2.conversation.mastraThreadId);
    expect(c1.grantedSkillNames).toEqual(["skill-creator"]);
    expect(c2.grantedSkillNames).toEqual([]);
    expect(() => resolveBotRuntime("a", two.id, "conversation-a")).toThrow();
  });
  it("makes confirmation idempotent and revisions conflict", () => {
    const d = createBotDraft("a", { objective: "Draft" });
    expect(() =>
      reviewBotDraft("a", d.id, {
        revision: 99,
        name: "X",
        description: "Y",
        instructions: "Z",
        modelId: "ollama-cloud/gpt-oss:20b",
        avatarColorToken: d.avatarColorToken,
      }),
    ).toThrow();
    const r = reviewBotDraft("a", d.id, {
      revision: d.revision,
      name: "Same",
      description: "Y",
      instructions: "Z",
      modelId: "ollama-cloud/gpt-oss:20b",
      avatarColorToken: d.avatarColorToken,
    });
    expect(createBotFromDraft("a", d.id, r.revision).id).toBe(
      createBotFromDraft("a", d.id, r.revision).id,
    );
  });
  it("restores a conversation draft, asks once, and keeps the avatar color through creation", () => {
    const nullain = ensureSystemBot("a");
    const conversation = ensureBotConversation("a", nullain.id, "interview-conversation");
    const started = advanceBotInterview(
      "a",
      conversation.id,
      "Crie um bot para acompanhar fornecedores",
    );
    expect(started).toMatchObject({ kind: "question" });
    const restored = findConversationDraft("a", conversation.id);
    expect(restored?.id).toBe(started?.draft.id);
    const review = advanceBotInterview("a", conversation.id, "Radar de fornecedores");
    expect(review).toMatchObject({ kind: "review" });
    const color = review!.draft.avatarColorToken;
    const created = createBotFromDraft("a", review!.draft.id, review!.draft.revision);
    expect(created.avatarColorToken).toBe(color);
    expect(createBotFromDraft("a", review!.draft.id, review!.draft.revision).id).toBe(created.id);
  });
  it("reuses a fresh interview after the draft was created or cancelled", () => {
    const nullain = ensureSystemBot("a");
    const conversation = ensureBotConversation("a", nullain.id, "interview-reuse");
    const first = advanceBotInterview("a", conversation.id, "Crie um bot para conciliar notas");
    expect(first).toMatchObject({ kind: "question" });
    const review = advanceBotInterview("a", conversation.id, "Conciliador");
    expect(review).toMatchObject({ kind: "review" });
    createBotFromDraft("a", review!.draft.id, review!.draft.revision);
    expect(advanceBotInterview("a", conversation.id, "Qual é a previsão do tempo?")).toBeNull();
    const second = advanceBotInterview(
      "a",
      conversation.id,
      "Crie um bot para acompanhar contratos",
    );
    expect(second).toMatchObject({ kind: "question" });
    expect(second!.draft.id).not.toBe(review!.draft.id);
  });
  it("updates profile, status and skill grants with revision conflicts", () => {
    const created = bot("a", "Profile Bot", ["skill-creator"]);
    const before = requireBot("a", created.id);
    expect(() =>
      updateBotProfile("a", created.id, { revision: before.revision + 99, name: "X" }),
    ).toThrow();
    const updated = updateBotProfile("a", created.id, {
      revision: before.revision,
      name: "Profile Bot Renomeado",
      status: "paused",
      skillNames: [],
    });
    expect(updated).toMatchObject({
      name: "Profile Bot Renomeado",
      status: "paused",
      revision: before.revision + 1,
    });
    expect(listGrantedSkillNames("a", created.id)).toEqual([]);
    expect(() => resolveBotRuntime("a", created.id, "profile-conversation")).toThrow(/pausado/);
    const resumed = updateBotProfile("a", created.id, {
      revision: updated.revision,
      status: "ready",
      skillNames: ["skill-creator"],
    });
    expect(resumed.status).toBe("ready");
    expect(listGrantedSkillNames("a", created.id)).toEqual(["skill-creator"]);
    expect(() =>
      updateBotProfile("a", created.id, { revision: resumed.revision, status: "x" }),
    ).toThrow(/Status inválido/);
    const system = ensureSystemBot("a");
    expect(() =>
      updateBotProfile("a", system.id, { revision: system.revision, name: "Outro" }),
    ).toThrow(/identidade principal/);
  });
  it("deletes a bot only with the exact name and cascades its data", () => {
    const created = bot("a", "Disposable Bot", ["skill-creator"]);
    const conversation = resolveBotRuntime("a", created.id, "disposable-conversation");
    expect(() => deleteBot("a", created.id, { confirmName: "Wrong" })).toThrow(/nome exato/);
    expect(() => deleteBot("b", created.id, { confirmName: "Disposable Bot" })).toThrow();
    const system = ensureSystemBot("a");
    expect(() => deleteBot("a", system.id, { confirmName: system.name })).toThrow(
      /não pode ser excluída/,
    );
    deleteBot("a", created.id, { confirmName: "Disposable Bot" });
    expect(() => requireBot("a", created.id)).toThrow();
    expect(() => resolveBotRuntime("a", created.id, "disposable-conversation")).toThrow();
    expect(listBots("a").some((entry) => entry.id === created.id)).toBe(false);
    expect(conversation.conversation.id.length).toBeGreaterThan(0);
  });
});
