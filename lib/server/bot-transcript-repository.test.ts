import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-"));
vi.stubEnv("NULLAIN_AUTH_SECRET", "test-secret-with-at-least-thirty-two-characters");
vi.stubEnv("NULLAIN_APP_DB_PATH", path.join(dir, "app.db"));
import {
  createBotDraft,
  createBotFromDraft,
  ensureBotConversation,
  reviewBotDraft,
} from "./bot-runtime-repository";
import {
  appendUserTranscript,
  cancelTranscriptRun,
  claimTranscriptRun,
  ensureTranscriptRun,
  finishTranscriptRun,
  getTranscriptRun,
  listBotTranscript,
  TranscriptRunCapability,
} from "./bot-transcript-repository";
import { getNullainDatabase, migrateNullainDatabase } from "./nullain-db";
let bot = "",
  conversation = "";
beforeAll(() => {
  const db = getNullainDatabase();
  migrateNullainDatabase(db);
  for (const id of ["a", "b"])
    db.prepare(
      'INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)',
    ).run(id, id, `${id}@test`, Date.now(), Date.now());
  const d = createBotDraft("a", { objective: "Transcript bot" });
  const r = reviewBotDraft("a", d.id, {
    revision: d.revision,
    name: "Transcript",
    description: "Transcript",
    instructions: "Help",
    modelId: "ollama-cloud/gpt-oss:20b",
    avatarColorToken: d.avatarColorToken,
  });
  bot = createBotFromDraft("a", d.id, r.revision).id;
  conversation = ensureBotConversation("a", bot, "conversation").id;
});
afterAll(() => {
  getNullainDatabase().close();
  delete (globalThis as typeof globalThis & { __nullainAppDatabase?: unknown })
    .__nullainAppDatabase;
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});
describe("bot transcript", () => {
  it("appends idempotently in stable order", () => {
    const one = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "one",
      parts: [{ type: "text", text: "one" }],
    });
    expect(
      appendUserTranscript("a", bot, conversation, {
        idempotencyKey: "one",
        parts: [{ type: "text", text: "one" }],
      }).id,
    ).toBe(one.id);
    appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "two",
      parts: [{ type: "text", text: "two" }],
    });
    expect(listBotTranscript("a", bot, conversation).map((m: any) => m.sequence)).toEqual([1, 2]);
  });
  it("rejects foreign ownership and forged parts", () => {
    expect(() => listBotTranscript("b", bot, conversation)).toThrow();
    expect(() =>
      appendUserTranscript("a", bot, conversation, {
        idempotencyKey: "x",
        parts: [{ type: "assistant" }],
      }),
    ).toThrow();
    expect(() =>
      appendUserTranscript("a", bot, conversation, {
        idempotencyKey: "y",
        parts: [{ type: "bot-review", version: 2 }],
      }),
    ).toThrow();
    expect(() =>
      appendUserTranscript("a", bot, conversation, {
        idempotencyKey: "forged-created",
        parts: [{ type: "bot-created", version: 1 }],
      }),
    ).toThrow();
  });
  it("creates one logical run, claims once, and finalizes with the internal capability", () => {
    const user = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "run-one",
      parts: [{ type: "text", text: "run" }],
    });
    const first = ensureTranscriptRun("a", bot, conversation, user.id);
    expect(ensureTranscriptRun("a", bot, conversation, user.id)).toEqual(first);
    const winner = claimTranscriptRun("a", bot, conversation, first.id);
    const loser = claimTranscriptRun("a", bot, conversation, first.id);
    expect(winner.claimed).toBe(true);
    expect(loser).toEqual({
      run: expect.objectContaining({ id: first.id, status: "running" }),
      claimed: false,
    });
    expect(JSON.stringify(winner)).not.toContain("claimToken");
    expect(
      listBotTranscript("a", bot, conversation).find(
        (message) => message.id === first.assistantMessageId,
      )?.status,
    ).toBe("streaming");
    expect(() =>
      finishTranscriptRun("a", bot, conversation, new TranscriptRunCapability(), "completed", [
        { type: "text", text: "no" },
      ]),
    ).toThrow();
    const done = finishTranscriptRun("a", bot, conversation, winner.capability!, "completed", [
      { type: "text", text: "done" },
    ]);
    expect(done.status).toBe("completed");
    expect(
      finishTranscriptRun("a", bot, conversation, winner.capability!, "completed", [
        { type: "text", text: "done" },
      ]).id,
    ).toBe(done.id);
    expect(claimTranscriptRun("a", bot, conversation, first.id).claimed).toBe(false);
    expect(
      listBotTranscript("a", bot, conversation).find(
        (message) => message.id === first.assistantMessageId,
      ),
    ).toMatchObject({ status: "completed", parts: [{ type: "text", text: "done" }] });
  });
  it.each(["failed", "cancelled", "interrupted"] as const)(
    "persists an honest %s terminal state",
    (terminal) => {
      const user = appendUserTranscript("a", bot, conversation, {
        idempotencyKey: `terminal-${terminal}`,
        parts: [{ type: "text", text: terminal }],
      });
      const run = ensureTranscriptRun("a", bot, conversation, user.id);
      const claim = claimTranscriptRun("a", bot, conversation, run.id);
      expect(claim.claimed).toBe(true);
      const result = finishTranscriptRun(
        "a",
        bot,
        conversation,
        claim.capability!,
        terminal,
        [{ type: "text", text: "partial" }],
        terminal === "failed" ? "Falha do modelo." : null,
      );
      expect(result.status).toBe(terminal);
      expect(
        listBotTranscript("a", bot, conversation).find(
          (message) => message.id === run.assistantMessageId,
        ),
      ).toMatchObject({
        status: terminal === "failed" ? "failed" : "cancelled",
        parts: [{ type: "text", text: "partial" }],
      });
    },
  );
  it("lets exactly one of two SQLite connections claim a queued run", () => {
    const user = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "concurrent-run",
      parts: [{ type: "text", text: "race" }],
    });
    const run = ensureTranscriptRun("a", bot, conversation, user.id);
    const first = new Database(path.join(dir, "app.db"));
    const second = new Database(path.join(dir, "app.db"));
    try {
      const sql =
        "UPDATE nullain_bot_run SET status='running',claimToken=?,claimedAt=?,updatedAt=? WHERE id=? AND status='queued'";
      const changes = [
        first.prepare(sql).run("first-token", 1, 1, run.id).changes,
        second.prepare(sql).run("second-token", 2, 2, run.id).changes,
      ];
      expect(changes.sort()).toEqual([0, 1]);
      expect(
        first.prepare("SELECT claimToken FROM nullain_bot_run WHERE id=?").get(run.id),
      ).toEqual({ claimToken: "first-token" });
    } finally {
      first.close();
      second.close();
    }
  });
  it("cancels a claimed run with the capability and stays idempotent", () => {
    const user = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "cancel-one",
      parts: [{ type: "text", text: "cancel" }],
    });
    const run = ensureTranscriptRun("a", bot, conversation, user.id);
    const claim = claimTranscriptRun("a", bot, conversation, run.id);
    expect(claim.claimed).toBe(true);
    const cancelled = cancelTranscriptRun(
      "a",
      bot,
      conversation,
      claim.capability!,
      "Cancelado pelo usuário.",
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.publicError).toBe("Cancelado pelo usuário.");
    expect(
      listBotTranscript("a", bot, conversation).find(
        (message) => message.id === run.assistantMessageId,
      ),
    ).toMatchObject({ status: "cancelled", publicError: "Cancelado pelo usuário." });
    expect(
      cancelTranscriptRun("a", bot, conversation, claim.capability!, "Cancelado pelo usuário.").id,
    ).toBe(cancelled.id);
    expect(getTranscriptRun("a", bot, conversation, run.id).status).toBe("cancelled");
    expect(() =>
      finishTranscriptRun("a", bot, conversation, claim.capability!, "completed", [
        { type: "text", text: "late" },
      ]),
    ).toThrow();
    expect(() =>
      cancelTranscriptRun("a", bot, conversation, new TranscriptRunCapability(), null),
    ).toThrow();
  });
});
