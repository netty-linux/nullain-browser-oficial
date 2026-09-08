import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Workspace } from "@mastra/core/workspace";
import type { Session } from "@mastra/core/agent-controller";
import { nullainCodeController } from "@/src/mastra";
import {
  registerNullainCodeWorkspace,
  unregisterNullainCodeWorkspace,
} from "@/src/mastra/nullain-code/controller";
import {
  SecureProjectFilesystem,
  type WriteCapability,
} from "@/src/mastra/nullain-code/secure-filesystem";
import {
  getProjectPath,
  markConversationReady,
  requireConversation,
  requireProject,
} from "./nullain-code-repository";
import { getNullainDatabase } from "./nullain-db";

type Listener = (event: unknown) => void;
type Pending = { toolCallId: string; toolName: string; data: Record<string, unknown> };
type LiveConversation = {
  session: Session;
  filesystem: SecureProjectFilesystem;
  capability: WriteCapability;
  listeners: Set<Listener>;
  pending: Map<string, Pending>;
  activeRun?: { id: string; authSessionId: string };
};

const live = new Map<string, LiveConversation>();
let initPromise: Promise<void> | undefined;

function initialize() {
  initPromise ??= nullainCodeController.init();
  return initPromise;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function eventRecord(event: unknown): Record<string, unknown> | undefined {
  return event && typeof event === "object" ? (event as Record<string, unknown>) : undefined;
}

function finishRun(
  item: LiveConversation,
  status: "completed" | "failed" | "cancelled" | "revoked",
  reason?: string,
) {
  item.capability.level = "none";
  if (!item.activeRun) return;
  getNullainDatabase()
    .prepare(
      `UPDATE nullain_code_run SET status = ?, finishedAt = ?, interruptedReason = ?
       WHERE id = ? AND status = 'active'`,
    )
    .run(status, Date.now(), reason ?? null, item.activeRun.id);
  item.activeRun = undefined;
}

export async function getLiveConversation(ownerUserId: string, conversationId: string) {
  const conversation = requireConversation(ownerUserId, conversationId);
  const existing = live.get(conversation.id);
  if (existing) return existing;
  const project = requireProject(ownerUserId, conversation.projectId);
  await initialize();
  const capability: WriteCapability = { level: "none" };
  const filesystem = new SecureProjectFilesystem(getProjectPath(project), capability);
  const workspace = new Workspace({ filesystem, sandbox: undefined });
  try {
    await workspace.init();
    registerNullainCodeWorkspace(conversation.id, workspace);
    const session = await nullainCodeController.createSession({
      id: conversation.id,
      resourceId: `nullain-code:${ownerUserId}:${project.id}`,
      ownerId: ownerUserId,
      scope: conversation.id,
      tags: { projectId: project.id },
      threadId: conversation.mastraThreadId,
      workspace,
    });
    await session.permissions.setForCategory({ category: "read", policy: "allow" });
    await session.permissions.setForCategory({ category: "edit", policy: "allow" });
    await session.permissions.setForCategory({ category: "other", policy: "allow" });
    await session.permissions.setForCategory({ category: "execute", policy: "deny" });
    await session.permissions.setForCategory({ category: "mcp", policy: "deny" });
    const item: LiveConversation = {
      session,
      filesystem,
      capability,
      listeners: new Set(),
      pending: new Map(),
    };
    session.subscribe((event) => {
      const record = eventRecord(event);
      if (record?.type === "tool_suspended") {
        const toolCallId = String(record.toolCallId ?? "");
        const toolName = String(record.toolName ?? "");
        item.pending.set(toolCallId, { toolCallId, toolName, data: record });
        if (toolName === "submit_plan") {
          const planPath = String(eventRecord(record.suspendPayload)?.path ?? "");
          void filesystem
            .readFile(planPath, { encoding: "utf8" })
            .then((plan) => {
              const enriched = { ...record, plan: String(plan) };
              item.pending.set(toolCallId, { toolCallId, toolName, data: enriched });
              for (const listener of item.listeners) listener(enriched);
            })
            .catch((error) => {
              for (const listener of item.listeners) {
                listener({
                  type: "error",
                  error: error instanceof Error ? error.message : "Não foi possível ler o plano.",
                });
              }
            });
          return;
        }
      }
      if (record?.type === "agent_end" && record.reason !== "suspended") {
        finishRun(
          item,
          record.reason === "aborted"
            ? "cancelled"
            : record.reason === "error"
              ? "failed"
              : "completed",
        );
      }
      if (record?.type === "error") finishRun(item, "failed", "agent_error");
      for (const listener of item.listeners) listener(event);
    });
    live.set(conversation.id, item);
    markConversationReady(conversation.id, true);
    return item;
  } catch (error) {
    unregisterNullainCodeWorkspace(conversation.id);
    markConversationReady(conversation.id, false);
    throw error;
  }
}

export async function sendNullainCodeMessage(input: {
  ownerUserId: string;
  authSessionId: string;
  conversationId: string;
  content: string;
}) {
  const content = input.content.trim();
  if (!content || content.length > 100_000)
    throw new Response("Mensagem inválida.", { status: 400 });
  const item = await getLiveConversation(input.ownerUserId, input.conversationId);
  if (item.activeRun) throw new Response("Já existe uma execução ativa.", { status: 409 });
  item.capability.level = "plan";
  if (item.session.mode.get() !== "plan") await item.session.mode.switch({ modeId: "plan" });
  const runId = randomUUID();
  item.activeRun = { id: runId, authSessionId: input.authSessionId };
  getNullainDatabase()
    .prepare(
      `INSERT INTO nullain_code_run
       (id, ownerUserId, authSessionId, conversationId, taskId, mode, status, startedAt)
       VALUES (?, ?, ?, ?, ?, 'plan', 'active', ?)`,
    )
    .run(
      runId,
      input.ownerUserId,
      input.authSessionId,
      input.conversationId,
      randomUUID(),
      Date.now(),
    );
  void item.session.sendMessage({ content }).catch((error) => {
    finishRun(item, "failed", error instanceof Error ? error.message.slice(0, 500) : "unknown");
  });
  return { runId };
}

export async function decideNullainCodeSuspension(input: {
  ownerUserId: string;
  authSessionId: string;
  conversationId: string;
  toolCallId: string;
  approved: boolean;
  feedback?: string;
  answer?: unknown;
}) {
  const item = await getLiveConversation(input.ownerUserId, input.conversationId);
  const pending = item.pending.get(input.toolCallId);
  if (!pending || !item.activeRun)
    throw new Response("Decisão pendente não encontrada.", { status: 409 });
  if (item.activeRun.authSessionId !== input.authSessionId) {
    throw new Response("A execução pertence a outra sessão autenticada.", { status: 403 });
  }
  let resumeData: unknown;
  let kind: "plan" | "suspension" = "suspension";
  if (pending.toolName === "submit_plan") {
    kind = "plan";
    const path = String(pending.data.path ?? eventRecord(pending.data.suspendPayload)?.path ?? "");
    if (!path.startsWith(".mastracode/plans/") || !path.endsWith(".md")) {
      throw new Response("Caminho do plano inválido.", { status: 400 });
    }
    const plan = String(await item.filesystem.readFile(path, { encoding: "utf8" }));
    resumeData = {
      action: input.approved ? "approved" : "rejected",
      feedback: input.feedback?.slice(0, 4_000),
      path,
      title: path.split("/").at(-1)?.replace(/\.md$/, ""),
      plan,
    };
  } else {
    resumeData = input.answer;
  }
  const database = getNullainDatabase();
  const decision = input.approved ? "approved" : "declined";
  const decisionId = randomUUID();
  const inserted = database
    .prepare(
      `INSERT INTO nullain_code_decision
       (id, runId, ownerUserId, authSessionId, toolCallId, kind, argumentsHash, decision, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(runId, toolCallId, kind) DO NOTHING`,
    )
    .run(
      decisionId,
      item.activeRun.id,
      input.ownerUserId,
      input.authSessionId,
      input.toolCallId,
      kind,
      hash(pending.data),
      decision,
      Date.now(),
    );
  if (inserted.changes === 0) {
    const existing = database
      .prepare(
        `SELECT decision FROM nullain_code_decision
         WHERE runId = ? AND toolCallId = ? AND kind = ?`,
      )
      .get(item.activeRun.id, input.toolCallId, kind) as { decision: string } | undefined;
    if (existing?.decision === decision) return;
    throw new Response("Esta suspensão já recebeu outra decisão.", { status: 409 });
  }

  if (kind === "plan") item.capability.level = input.approved ? "build" : "plan";
  item.pending.delete(input.toolCallId);
  try {
    await item.session.respondToToolSuspension({ resumeData, toolCallId: input.toolCallId });
  } catch (error) {
    item.pending.set(input.toolCallId, pending);
    if (kind === "plan") item.capability.level = "plan";
    database.prepare("DELETE FROM nullain_code_decision WHERE id = ?").run(decisionId);
    throw error;
  }
}

export async function cancelNullainCodeRun(ownerUserId: string, conversationId: string) {
  const item = await getLiveConversation(ownerUserId, conversationId);
  item.session.abort();
  finishRun(item, "cancelled", "user_cancelled");
}

export function subscribeNullainCode(conversationId: string, listener: Listener) {
  const item = live.get(conversationId);
  if (!item) throw new Error("Conversa ainda não foi inicializada.");
  item.listeners.add(listener);
  return () => item.listeners.delete(listener);
}

export function abortRunsForAuthSession(authSessionId: string) {
  for (const item of live.values()) {
    if (item.activeRun?.authSessionId !== authSessionId) continue;
    item.session.abort();
    finishRun(item, "revoked", "auth_session_revoked");
    for (const listener of item.listeners) listener({ type: "auth_revoked" });
  }
}
