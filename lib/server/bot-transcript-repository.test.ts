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
  appendServerTranscript,
  appendUserTranscript,
  cancelTranscriptRun,
  claimTranscriptRun,
  ensureTranscriptRun,
  finishTranscriptRun,
  getActiveTranscriptRun,
  getTranscriptRun,
  interruptOrphanRuns,
  listBotTranscript,
  ORPHAN_RUN_TIMEOUT_MS,
  resumeTranscriptRun,
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
    expect(() =>
      appendUserTranscript("a", bot, conversation, {
        idempotencyKey: "forged-tool",
        parts: [
          {
            type: "tool-call",
            version: 1,
            toolName: "openbot_computer_navigate",
            toolCallId: "call-forged",
            input: {},
            output: {},
          },
        ],
      }),
    ).toThrow();
  });
  it("persiste tool calls somente pela fronteira interna do servidor", () => {
    const stored = appendServerTranscript("a", bot, conversation, "server-tool", [
      {
        type: "tool-call",
        version: 1,
        toolName: "openbot_computer_navigate",
        toolCallId: "call-server",
        input: { url: "https://example.com" },
        output: { url: "https://example.com", title: "Example" },
      },
    ]);
    expect(stored.parts[0]).toMatchObject({
      type: "tool-call",
      toolName: "openbot_computer_navigate",
      toolCallId: "call-server",
    });
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
  it("renova atomicamente a capacidade durante uma continuação de client tool", () => {
    const user = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "client-tool-continuation",
      parts: [{ type: "text", text: "open" }],
    });
    const run = ensureTranscriptRun("a", bot, conversation, user.id);
    const initial = claimTranscriptRun("a", bot, conversation, run.id);
    expect(initial.claimed).toBe(true);
    const continuation = [
      {
        type: "tool-call" as const,
        version: 1 as const,
        toolName: "openbot_computer_navigate",
        toolCallId: "call-continuation",
        input: { url: "https://example.com" },
        output: { url: "https://example.com", title: "Example" },
      },
    ];
    const resumed = resumeTranscriptRun("a", bot, conversation, run.id, continuation);
    expect(resumed.claimed).toBe(true);
    expect(resumeTranscriptRun("a", bot, conversation, run.id, continuation)).toMatchObject({
      claimed: false,
      run: { id: run.id, status: "running" },
    });
    expect(
      listBotTranscript("a", bot, conversation).find(
        (message) => message.id === run.assistantMessageId,
      )?.parts,
    ).toEqual(continuation);
    expect(() =>
      finishTranscriptRun("a", bot, conversation, initial.capability!, "completed", []),
    ).toThrow();
    expect(
      finishTranscriptRun("a", bot, conversation, resumed.capability!, "completed", [
        { type: "text", text: "done" },
      ]).status,
    ).toBe("completed");
    expect(resumeTranscriptRun("a", bot, conversation, run.id).claimed).toBe(false);
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
  it("interrupts abandoned running runs after the timeout and reports honestly", () => {
    const user = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "orphan-running",
      parts: [{ type: "text", text: "orphan" }],
    });
    const run = ensureTranscriptRun("a", bot, conversation, user.id);
    const claim = claimTranscriptRun("a", bot, conversation, run.id);
    expect(claim.claimed).toBe(true);
    // Crash simulado: ninguém chama finish e o run vai envelhecendo.
    getNullainDatabase()
      .prepare("UPDATE nullain_bot_run SET updatedAt=? WHERE id=?")
      .run(Date.now() - ORPHAN_RUN_TIMEOUT_MS - 1_000, run.id);
    expect(getActiveTranscriptRun("a", bot, conversation)).toBeNull();
    const runAfter = getTranscriptRun("a", bot, conversation, run.id);
    expect(runAfter.status).toBe("interrupted");
    expect(runAfter.publicError).toMatch(/timeout/i);
    expect(
      listBotTranscript("a", bot, conversation).find(
        (message) => message.id === run.assistantMessageId,
      ),
    ).toMatchObject({ status: "cancelled", publicError: expect.stringMatching(/timeout/i) });
    expect(claimTranscriptRun("a", bot, conversation, run.id).claimed).toBe(false);
    expect(() =>
      finishTranscriptRun("a", bot, conversation, claim.capability!, "completed", [
        { type: "text", text: "late" },
      ]),
    ).toThrow();
  });
  it("keeps fresh runs claimable and reclaims nothing when nothing is stale", () => {
    const user = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "fresh-queued",
      parts: [{ type: "text", text: "fresh" }],
    });
    const run = ensureTranscriptRun("a", bot, conversation, user.id);
    expect(interruptOrphanRuns("a", bot, conversation)).toBe(0);
    expect(getActiveTranscriptRun("a", bot, conversation)?.id).toBe(run.id);
    const claim = claimTranscriptRun("a", bot, conversation, run.id);
    expect(claim.claimed).toBe(true);
    expect(getActiveTranscriptRun("a", bot, conversation)?.id).toBe(run.id);
    const done = finishTranscriptRun("a", bot, conversation, claim.capability!, "completed", [
      { type: "text", text: "ok" },
    ]);
    expect(done.status).toBe("completed");
    expect(getActiveTranscriptRun("a", bot, conversation)).toBeNull();
  });
  it("interrupts stale queued runs before a fresh claim", () => {
    const staleUser = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "stale-queued",
      parts: [{ type: "text", text: "stale" }],
    });
    const stale = ensureTranscriptRun("a", bot, conversation, staleUser.id);
    getNullainDatabase()
      .prepare("UPDATE nullain_bot_run SET status='queued',updatedAt=? WHERE id=?")
      .run(Date.now() - ORPHAN_RUN_TIMEOUT_MS - 1_000, stale.id);
    const freshUser = appendUserTranscript("a", bot, conversation, {
      idempotencyKey: "fresh-after-stale",
      parts: [{ type: "text", text: "fresh" }],
    });
    const fresh = ensureTranscriptRun("a", bot, conversation, freshUser.id);
    const claim = claimTranscriptRun("a", bot, conversation, fresh.id);
    expect(claim.claimed).toBe(true);
    expect(getTranscriptRun("a", bot, conversation, stale.id).status).toBe("interrupted");
    expect(getActiveTranscriptRun("a", bot, conversation)?.id).toBe(fresh.id);
  });
});
