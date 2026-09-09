import "server-only";
import { randomUUID } from "node:crypto";
import { getNullainDatabase } from "./nullain-db";
import { requireBot } from "./bot-runtime-repository";

type Role = "user" | "assistant";
type Status = "pending" | "streaming" | "completed" | "failed" | "cancelled";
type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type TranscriptRun = {
  id: string;
  botConversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
  publicError: string | null;
};
type InternalRun = TranscriptRun & { claimToken: string | null };
export class TranscriptRunCapability {
  private readonly marker = true;
  toJSON() {
    return undefined;
  }
}
const runCapabilities = new WeakMap<
  TranscriptRunCapability,
  { runId: string; token: string; finishedAs?: Exclude<RunStatus, "queued" | "running"> }
>();
export type TranscriptPart =
  | { type: "text"; text: string }
  | { type: "bot-review" | "bot-created"; version: 1; [key: string]: unknown };
export type TranscriptMessage = {
  id: string;
  botConversationId: string;
  role: Role;
  status: Status;
  sequence: number;
  idempotencyKey: string | null;
  parts: TranscriptPart[];
  createdAt: number;
  updatedAt: number;
  publicError: string | null;
};
type TranscriptRow = Omit<TranscriptMessage, "parts"> & { partsJson: string };
const maxParts = 32,
  maxBytes = 64 * 1024;
function conversation(owner: string, bot: string, id: string) {
  requireBot(owner, bot);
  const row = getNullainDatabase()
    .prepare("SELECT * FROM nullain_bot_conversation WHERE id=? AND ownerUserId=? AND botId=?")
    .get(id, owner, bot) as { id: string } | undefined;
  if (!row) throw new Response("Conversa não encontrada.", { status: 404 });
  return row;
}
function parts(value: unknown, allowStructured = true): TranscriptPart[] {
  if (!Array.isArray(value) || value.length > maxParts) throw new Error("Partes inválidas.");
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > maxBytes) throw new Error("Mensagem muito grande.");
  for (const part of value) {
    const type =
      part && typeof part === "object"
        ? (part as { type?: unknown; version?: unknown }).type
        : undefined;
    if (
      (type !== "text" && type !== "bot-review" && type !== "bot-created") ||
      (type !== "text" && (!allowStructured || (part as { version?: unknown }).version !== 1))
    )
      throw new Error("Parte desconhecida.");
  }
  return value as TranscriptPart[];
}
function toMessage(row: TranscriptRow): TranscriptMessage {
  return {
    id: row.id,
    botConversationId: row.botConversationId,
    role: row.role,
    status: row.status,
    sequence: row.sequence,
    idempotencyKey: row.idempotencyKey,
    parts: parts(JSON.parse(row.partsJson)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publicError: row.publicError,
  };
}
export function listBotTranscript(
  owner: string,
  bot: string,
  conversationId: string,
  limit = 100,
  beforeSequence?: number,
): TranscriptMessage[] {
  conversation(owner, bot, conversationId);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const rows = (
    getNullainDatabase()
      .prepare(
        beforeSequence === undefined
          ? "SELECT * FROM nullain_bot_message WHERE botConversationId=? ORDER BY sequence DESC LIMIT ?"
          : "SELECT * FROM nullain_bot_message WHERE botConversationId=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
      )
      .all(
        ...(beforeSequence === undefined
          ? [conversationId, boundedLimit]
          : [conversationId, beforeSequence, boundedLimit]),
      ) as TranscriptRow[]
  ).map(toMessage);
  return rows.reverse();
}
export function appendUserTranscript(
  owner: string,
  bot: string,
  conversationId: string,
  input: { idempotencyKey: unknown; parts: unknown },
): TranscriptMessage {
  conversation(owner, bot, conversationId);
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length > 128)
    throw new Error("Chave inválida.");
  const db = getNullainDatabase(),
    parsed = parts(input.parts, false),
    json = JSON.stringify(parsed);
  const find = db.prepare(
    "SELECT * FROM nullain_bot_message WHERE botConversationId=? AND idempotencyKey=?",
  );
  const old = find.get(conversationId, input.idempotencyKey) as TranscriptRow | undefined;
  if (old) return toMessage(old);
  return db.transaction(() => {
    const again = find.get(conversationId, input.idempotencyKey) as TranscriptRow | undefined;
    if (again) return toMessage(again);
    const now = Date.now(),
      sequence = (
        db
          .prepare(
            "SELECT COALESCE(MAX(sequence),0)+1 AS n FROM nullain_bot_message WHERE botConversationId=?",
          )
          .get(conversationId) as { n: number }
      ).n;
    const row = {
      id: randomUUID(),
      botConversationId: conversationId,
      role: "user" as Role,
      status: "completed" as Status,
      sequence,
      idempotencyKey: input.idempotencyKey,
      partsJson: json,
      createdAt: now,
      updatedAt: now,
      publicError: null,
    };
    db.prepare(
      "INSERT INTO nullain_bot_message (id,botConversationId,role,status,sequence,idempotencyKey,partsJson,publicError,createdAt,updatedAt) VALUES (@id,@botConversationId,@role,@status,@sequence,@idempotencyKey,@partsJson,@publicError,@createdAt,@updatedAt)",
    ).run(row);
    return toMessage(row as TranscriptRow);
  })();
}

export function appendServerTranscript(
  owner: string,
  bot: string,
  conversationId: string,
  idempotencyKey: string,
  inputParts: unknown,
): TranscriptMessage {
  conversation(owner, bot, conversationId);
  if (!idempotencyKey || idempotencyKey.length > 128) throw new Error("Chave inválida.");
  const db = getNullainDatabase();
  const parsed = parts(inputParts, true);
  const find = db.prepare(
    "SELECT * FROM nullain_bot_message WHERE botConversationId=? AND idempotencyKey=?",
  );
  return db.transaction(() => {
    const existing = find.get(conversationId, idempotencyKey) as TranscriptRow | undefined;
    if (existing) return toMessage(existing);
    const now = Date.now();
    const sequence = (
      db
        .prepare(
          "SELECT COALESCE(MAX(sequence),0)+1 AS n FROM nullain_bot_message WHERE botConversationId=?",
        )
        .get(conversationId) as { n: number }
    ).n;
    const row = {
      id: randomUUID(),
      botConversationId: conversationId,
      role: "assistant" as Role,
      status: "completed" as Status,
      sequence,
      idempotencyKey,
      partsJson: JSON.stringify(parsed),
      createdAt: now,
      updatedAt: now,
      publicError: null,
    };
    db.prepare(
      "INSERT INTO nullain_bot_message (id,botConversationId,role,status,sequence,idempotencyKey,partsJson,publicError,createdAt,updatedAt) VALUES (@id,@botConversationId,@role,@status,@sequence,@idempotencyKey,@partsJson,@publicError,@createdAt,@updatedAt)",
    ).run(row);
    return toMessage(row as TranscriptRow);
  })();
}
export function ensureAssistantTranscript(
  owner: string,
  bot: string,
  conversationId: string,
  userMessageId: string,
): TranscriptMessage {
  conversation(owner, bot, conversationId);
  const db = getNullainDatabase();
  return db.transaction(() => {
    const prior = db
      .prepare(
        "SELECT * FROM nullain_bot_message WHERE botConversationId=? AND parentMessageId=? AND role='assistant'",
      )
      .get(conversationId, userMessageId) as TranscriptRow | undefined;
    if (prior) return toMessage(prior);
    const now = Date.now(),
      sequence = (
        db
          .prepare(
            "SELECT COALESCE(MAX(sequence),0)+1 AS n FROM nullain_bot_message WHERE botConversationId=?",
          )
          .get(conversationId) as { n: number }
      ).n;
    const row = {
      id: randomUUID(),
      botConversationId: conversationId,
      parentMessageId: userMessageId,
      role: "assistant" as Role,
      status: "pending" as Status,
      sequence,
      idempotencyKey: null,
      partsJson: "[]",
      publicError: null,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(
      "INSERT INTO nullain_bot_message (id,botConversationId,parentMessageId,role,status,sequence,partsJson,publicError,createdAt,updatedAt) VALUES (@id,@botConversationId,@parentMessageId,@role,@status,@sequence,@partsJson,@publicError,@createdAt,@updatedAt)",
    ).run(row);
    return toMessage(row as TranscriptRow);
  })();
}
export function claimTranscriptRun(
  owner: string,
  bot: string,
  conversationId: string,
  runId: string,
): { run: TranscriptRun; claimed: boolean; capability?: TranscriptRunCapability } {
  conversation(owner, bot, conversationId);
  const db = getNullainDatabase(),
    token = randomUUID(),
    now = Date.now();
  const { changed, row } = db.transaction(() => {
    markOrphanRuns(db, conversationId, now);
    const changed = db
      .prepare(
        "UPDATE nullain_bot_run SET status='running',claimToken=?,claimedAt=?,updatedAt=? WHERE id=? AND botConversationId=? AND status='queued'",
      )
      .run(token, now, now, runId, conversationId).changes;
    const row = db
      .prepare(
        "SELECT id,botConversationId,userMessageId,assistantMessageId,status,createdAt,updatedAt,publicError FROM nullain_bot_run WHERE id=? AND botConversationId=?",
      )
      .get(runId, conversationId) as TranscriptRun | undefined;
    if (changed === 1 && row)
      db.prepare(
        "UPDATE nullain_bot_message SET status='streaming',updatedAt=? WHERE id=? AND botConversationId=? AND status='pending'",
      ).run(now, row.assistantMessageId, conversationId);
    return { changed, row };
  })();
  if (!row) throw new Response("Execução não encontrada.", { status: 404 });
  if (changed !== 1) return { run: row, claimed: false };
  const capability = new TranscriptRunCapability();
  runCapabilities.set(capability, { runId, token });
  return { run: row, claimed: true, capability };
}

export function cancelTranscriptRun(
  owner: string,
  bot: string,
  conversationId: string,
  capability: TranscriptRunCapability,
  publicError: string | null = null,
): TranscriptRun {
  conversation(owner, bot, conversationId);
  const authority = runCapabilities.get(capability);
  if (!authority) throw new Error("Capacidade de execução inválida.");
  const db = getNullainDatabase(),
    now = Date.now();
  return db.transaction(() => {
    const current = db
      .prepare("SELECT * FROM nullain_bot_run WHERE id=? AND botConversationId=?")
      .get(authority.runId, conversationId) as InternalRun | undefined;
    if (!current) throw new Response("Execução não encontrada.", { status: 404 });
    if (
      (current.status === "cancelled" || current.status === "interrupted") &&
      authority.finishedAs
    ) {
      return current;
    }
    if (current.status !== "queued" && current.status !== "running")
      throw new Error("Transição de execução inválida.");
    if (current.status === "running" && current.claimToken !== authority.token)
      throw new Error("Transição de execução inválida.");
    const existing = db
      .prepare("SELECT partsJson FROM nullain_bot_message WHERE id=? AND botConversationId=?")
      .get(current.assistantMessageId, conversationId) as { partsJson: string } | undefined;
    const content = existing ? JSON.stringify(parts(JSON.parse(existing.partsJson))) : "[]";
    db.prepare(
      "UPDATE nullain_bot_message SET status='cancelled',publicError=?,updatedAt=? WHERE id=? AND botConversationId=? AND role='assistant' AND status IN ('pending','streaming')",
    ).run(publicError, now, current.assistantMessageId, conversationId);
    const changed = db
      .prepare(
        current.status === "running"
          ? "UPDATE nullain_bot_run SET status='cancelled',claimToken=NULL,publicError=?,updatedAt=? WHERE id=? AND botConversationId=? AND status='running' AND claimToken=?"
          : "UPDATE nullain_bot_run SET status='cancelled',claimToken=NULL,publicError=?,updatedAt=? WHERE id=? AND botConversationId=? AND status='queued'",
      )
      .run(
        ...(current.status === "running"
          ? [publicError, now, current.id, conversationId, authority.token]
          : [publicError, now, current.id, conversationId]),
      ).changes;
    if (changed !== 1) throw new Error("A execução perdeu sua capacidade.");
    void content;
    authority.finishedAs = "cancelled";
    return db
      .prepare(
        "SELECT id,botConversationId,userMessageId,assistantMessageId,status,createdAt,updatedAt,publicError FROM nullain_bot_run WHERE id=?",
      )
      .get(current.id) as TranscriptRun;
  })();
}

export const ORPHAN_RUN_TIMEOUT_MS = 10 * 60 * 1_000;
const ORPHAN_MESSAGE = "Execução interrompida por perda de capacidade (timeout).";
type NullainDatabase = ReturnType<typeof getNullainDatabase>;

/** Marca como `interrupted` os runs que levam colgando mais do umbral sem
 * terminar — o servidor morreu entre claim e finish. Devolve quantos afetou. */
function markOrphanRuns(db: NullainDatabase, conversationId: string, now: number): number {
  const deadline = now - ORPHAN_RUN_TIMEOUT_MS;
  const orphans = db
    .prepare(
      "SELECT id,assistantMessageId FROM nullain_bot_run WHERE botConversationId=? AND status IN ('queued','running') AND updatedAt<?",
    )
    .all(conversationId, deadline) as Array<{ id: string; assistantMessageId: string }>;
  if (!orphans.length) return 0;
  const placeholders = orphans.map(() => "?").join(",");
  const messageIds = orphans.map((row) => row.assistantMessageId);
  db.prepare(
    `UPDATE nullain_bot_message SET status='cancelled',publicError=?,updatedAt=? WHERE id IN (${placeholders})`,
  ).run(ORPHAN_MESSAGE, now, ...messageIds);
  db.prepare(
    "UPDATE nullain_bot_run SET status='interrupted',claimToken=NULL,publicError=?,updatedAt=? WHERE botConversationId=? AND status IN ('queued','running') AND updatedAt<?",
  ).run(ORPHAN_MESSAGE, now, conversationId, deadline);
  return orphans.length;
}

export function interruptOrphanRuns(
  owner: string,
  bot: string,
  conversationId: string,
  now = Date.now(),
): number {
  conversation(owner, bot, conversationId);
  const db = getNullainDatabase();
  return db.transaction(() => markOrphanRuns(db, conversationId, now))();
}

export function getTranscriptRun(
  owner: string,
  bot: string,
  conversationId: string,
  runId: string,
): TranscriptRun {
  conversation(owner, bot, conversationId);
  const row = getNullainDatabase()
    .prepare(
      "SELECT id,botConversationId,userMessageId,assistantMessageId,status,createdAt,updatedAt,publicError FROM nullain_bot_run WHERE id=? AND botConversationId=?",
    )
    .get(runId, conversationId) as TranscriptRun | undefined;
  if (!row) throw new Response("Execução não encontrada.", { status: 404 });
  return row;
}

export function getTranscriptMessage(
  owner: string,
  bot: string,
  conversationId: string,
  messageId: string,
): TranscriptMessage {
  conversation(owner, bot, conversationId);
  const row = getNullainDatabase()
    .prepare("SELECT * FROM nullain_bot_message WHERE id=? AND botConversationId=?")
    .get(messageId, conversationId) as TranscriptRow | undefined;
  if (!row) throw new Response("Mensagem não encontrada.", { status: 404 });
  return toMessage(row);
}

export function getActiveTranscriptRun(
  owner: string,
  bot: string,
  conversationId: string,
): TranscriptRun | null {
  conversation(owner, bot, conversationId);
  const db = getNullainDatabase();
  db.transaction(() => markOrphanRuns(db, conversationId, Date.now()))();
  return (
    (db
      .prepare(
        "SELECT id,botConversationId,userMessageId,assistantMessageId,status,createdAt,updatedAt,publicError FROM nullain_bot_run WHERE botConversationId=? AND status IN ('queued','running') ORDER BY createdAt DESC LIMIT 1",
      )
      .get(conversationId) as TranscriptRun | undefined) ?? null
  );
}

export function ensureTranscriptRun(
  owner: string,
  bot: string,
  conversationId: string,
  userMessageId: string,
): TranscriptRun {
  conversation(owner, bot, conversationId);
  const db = getNullainDatabase();
  return db.transaction(() => {
    const user = db
      .prepare(
        "SELECT id FROM nullain_bot_message WHERE id=? AND botConversationId=? AND role='user'",
      )
      .get(userMessageId, conversationId);
    if (!user) throw new Response("Mensagem não encontrada.", { status: 404 });
    const old = db
      .prepare(
        "SELECT id,botConversationId,userMessageId,assistantMessageId,status,createdAt,updatedAt,publicError FROM nullain_bot_run WHERE userMessageId=?",
      )
      .get(userMessageId) as TranscriptRun | undefined;
    if (old) return old;
    const assistant = ensureAssistantTranscript(owner, bot, conversationId, userMessageId),
      now = Date.now();
    const row = {
      id: randomUUID(),
      botConversationId: conversationId,
      userMessageId,
      assistantMessageId: assistant.id,
      status: "queued" as RunStatus,
      claimToken: null,
      publicError: null,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(
      "INSERT INTO nullain_bot_run (id,botConversationId,userMessageId,assistantMessageId,status,claimToken,publicError,createdAt,updatedAt) VALUES (@id,@botConversationId,@userMessageId,@assistantMessageId,@status,@claimToken,@publicError,@createdAt,@updatedAt)",
    ).run(row);
    return {
      id: row.id,
      botConversationId: row.botConversationId,
      userMessageId,
      assistantMessageId: assistant.id,
      status: row.status,
      createdAt: now,
      updatedAt: now,
      publicError: null,
    };
  })();
}

export function finishTranscriptRun(
  owner: string,
  bot: string,
  conversationId: string,
  capability: TranscriptRunCapability,
  status: Extract<RunStatus, "completed" | "failed" | "cancelled" | "interrupted">,
  content: unknown,
  publicError: string | null = null,
): TranscriptRun {
  conversation(owner, bot, conversationId);
  const authority = runCapabilities.get(capability);
  if (!authority) throw new Error("Capacidade de execução inválida.");
  const db = getNullainDatabase(),
    json = JSON.stringify(parts(content)),
    now = Date.now();
  return db.transaction(() => {
    const current = db
      .prepare("SELECT * FROM nullain_bot_run WHERE id=? AND botConversationId=?")
      .get(authority.runId, conversationId) as InternalRun | undefined;
    if (!current) throw new Response("Execução não encontrada.", { status: 404 });
    if (current.status === status && authority.finishedAs === status) {
      return current;
    }
    if (current.status !== "running" || current.claimToken !== authority.token)
      throw new Error("Transição de execução inválida.");
    const messageStatus =
      status === "completed" ? "completed" : status === "failed" ? "failed" : "cancelled";
    db.prepare(
      "UPDATE nullain_bot_message SET status=?,partsJson=?,publicError=?,updatedAt=? WHERE id=? AND botConversationId=? AND role='assistant' AND status IN ('pending','streaming')",
    ).run(messageStatus, json, publicError, now, current.assistantMessageId, conversationId);
    const changed = db
      .prepare(
        "UPDATE nullain_bot_run SET status=?,claimToken=NULL,publicError=?,updatedAt=? WHERE id=? AND botConversationId=? AND status='running' AND claimToken=?",
      )
      .run(status, publicError, now, current.id, conversationId, authority.token).changes;
    if (changed !== 1) throw new Error("A execução perdeu sua capacidade.");
    authority.finishedAs = status;
    return db
      .prepare(
        "SELECT id,botConversationId,userMessageId,assistantMessageId,status,createdAt,updatedAt,publicError FROM nullain_bot_run WHERE id=?",
      )
      .get(current.id) as TranscriptRun;
  })();
}
