"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CircleStopIcon,
  FolderPlusIcon,
  LogOutIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useNullainCodeStore,
  type CodeConversation,
  type CodeProject,
} from "@/lib/nullain-code-store";

function messageText(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const message = raw as { content?: unknown; role?: string };
  if (typeof message.content === "string") return message.content;
  const parts = (message.content as { parts?: unknown[] } | undefined)?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") return record.text;
      if (record.type === "reasoning" && typeof record.text === "string") return record.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function roleOf(raw: unknown) {
  return raw && typeof raw === "object" && (raw as { role?: unknown }).role === "user"
    ? "user"
    : "assistant";
}

function eventRecord(raw: unknown) {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
}

export function NullainCodeWorkspace({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const state = useNullainCodeStore();
  const set = state.set;
  const [projectName, setProjectName] = useState("");
  const [composer, setComposer] = useState("");
  const [suspensionAnswer, setSuspensionAnswer] = useState("");
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [deciding, setDeciding] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const source = useRef<EventSource | null>(null);
  const decisionLock = useRef(false);

  const request = useCallback(
    async (url: string, init?: RequestInit) => {
      const response = await fetch(url, init);
      if (response.status === 401) {
        router.replace("/code/login");
        throw new Error("Sessão encerrada.");
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Operação recusada.");
      return body;
    },
    [router],
  );

  const hydrateMessages = useCallback(
    async (conversationId: string) => {
      const body = await request(`/api/code/conversations/${conversationId}/messages`);
      set({ messages: body.messages ?? [] });
    },
    [request, set],
  );

  useEffect(() => {
    void request("/api/code/projects")
      .then((body) => {
        const projects = body.projects as CodeProject[];
        set({ projects, projectId: projects[0]?.id });
      })
      .catch((error) => set({ error: error.message }));
  }, [request, set]);

  useEffect(() => {
    if (!state.projectId) return;
    void request(`/api/code/conversations?projectId=${encodeURIComponent(state.projectId)}`)
      .then((body) => {
        const conversations = body.conversations as CodeConversation[];
        set({ conversations, conversationId: conversations[0]?.id, messages: [], events: [] });
      })
      .catch((error) => set({ error: error.message }));
  }, [request, set, state.projectId]);

  useEffect(() => {
    source.current?.close();
    set({ connected: false, messages: [], events: [] });
    if (!state.conversationId) return;
    const conversationId = state.conversationId;
    const next = new EventSource(`/api/code/conversations/${conversationId}/events`);
    source.current = next;
    next.addEventListener("ready", (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as { pending?: unknown[] };
      set({ connected: true, events: snapshot.pending ?? [] });
      void hydrateMessages(conversationId);
    });
    next.addEventListener("controller", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as unknown;
      const record = eventRecord(parsed);
      set({ events: [...useNullainCodeStore.getState().events.slice(-199), parsed] });
      if (record?.type === "message_update" || record?.type === "message_end") {
        const message = record.message;
        if (message && typeof message === "object") {
          const id = (message as { id?: unknown }).id;
          const current = useNullainCodeStore.getState().messages;
          const index = current.findIndex((item) => eventRecord(item)?.id === id);
          set({
            messages:
              index < 0
                ? [...current, message]
                : current.map((item, i) => (i === index ? message : item)),
          });
        }
      }
      if (record?.type === "agent_end" || record?.type === "error") set({ busy: false });
    });
    next.addEventListener("auth-revoked", () => router.replace("/code/login"));
    next.onerror = () => set({ connected: false });
    return () => next.close();
  }, [hydrateMessages, router, set, state.conversationId]);

  const pending = useMemo(() => {
    const events = state.events.map(eventRecord);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== "tool_suspended") continue;
      const resolved = events
        .slice(index + 1)
        .some(
          (later) =>
            later?.toolCallId === event.toolCallId &&
            (later?.type === "tool_end" || later?.type === "tool_suspension_cancelled"),
        );
      if (!resolved) return event;
    }
    return undefined;
  }, [state.events]);
  const pendingPayload = eventRecord(pending?.suspendPayload);
  const pendingOptions = Array.isArray(pendingPayload?.options)
    ? pendingPayload.options
        .map((option) => eventRecord(option))
        .filter((option): option is Record<string, unknown> => Boolean(option))
    : [];

  async function createProject() {
    try {
      const body = await request("/api/code/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      const project = body.project as CodeProject;
      set({ projects: [project, ...state.projects], projectId: project.id, error: undefined });
      setProjectName("");
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Falha ao criar projeto." });
    }
  }

  async function createConversation() {
    if (!state.projectId) return;
    try {
      const body = await request("/api/code/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: state.projectId }),
      });
      const conversation = body.conversation as CodeConversation;
      set({
        conversations: [conversation, ...state.conversations],
        conversationId: conversation.id,
        error: undefined,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Falha ao criar conversa." });
    }
  }

  async function send() {
    if (!state.conversationId || !state.connected || !composer.trim()) return;
    const content = composer;
    setComposer("");
    set({ busy: true, error: undefined });
    try {
      await request(`/api/code/conversations/${state.conversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : "Falha ao enviar." });
    }
  }

  async function decide(approved: boolean, answer?: unknown) {
    if (decisionLock.current || !state.conversationId || typeof pending?.toolCallId !== "string")
      return;
    decisionLock.current = true;
    setDeciding(true);
    const toolCallId = pending.toolCallId;
    try {
      await request(`/api/code/conversations/${state.conversationId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolCallId, approved, answer }),
      });
      set({
        error: undefined,
        events: [
          ...useNullainCodeStore.getState().events,
          { type: "tool_suspension_cancelled", toolCallId, reason: "answered" },
        ],
      });
      setSuspensionAnswer("");
      setSelectedAnswers([]);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Falha ao responder ao agente." });
    } finally {
      decisionLock.current = false;
      setDeciding(false);
    }
  }

  function answerSuspension() {
    const multiSelect = pendingPayload?.selectionMode === "multi_select";
    const answer = pendingOptions.length
      ? multiSelect
        ? selectedAnswers
        : selectedAnswers[0]
      : suspensionAnswer.trim();
    if (!answer || (Array.isArray(answer) && answer.length === 0)) {
      set({ error: "Informe uma resposta para o agente." });
      return;
    }
    void decide(true, answer);
  }

  async function logout() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/code/login");
    router.refresh();
  }

  async function changePassword() {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: passwords.current,
        newPassword: passwords.next,
        revokeOtherSessions: true,
      }),
    });
    if (!response.ok) return set({ error: "Não foi possível alterar a senha." });
    setPasswords({ current: "", next: "" });
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_18rem] max-xl:grid-cols-[13rem_minmax(0,1fr)] max-lg:grid-cols-1">
      <aside className="flex min-h-0 flex-col border-r p-3 max-lg:hidden">
        <div className="mb-3 flex gap-2">
          <Input
            placeholder="Novo projeto"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <Button size="icon" onClick={() => void createProject()}>
            <FolderPlusIcon />
          </Button>
        </div>
        <div className="space-y-1 overflow-auto">
          {state.projects.map((project) => (
            <button
              key={project.id}
              onClick={() => set({ projectId: project.id })}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm ${state.projectId === project.id ? "bg-muted font-medium" : "hover:bg-muted/60"}`}
            >
              {project.name}
            </button>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void createConversation()}
          disabled={!state.projectId}
        >
          <PlusIcon /> Nova conversa
        </Button>
        <div className="mt-3 space-y-1 overflow-auto">
          {state.conversations.map((conversation, index) => (
            <button
              key={conversation.id}
              onClick={() => set({ conversationId: conversation.id })}
              className={`w-full rounded-xl px-3 py-2 text-left text-xs ${state.conversationId === conversation.id ? "bg-muted" : "hover:bg-muted/60"}`}
            >
              Conversa {state.conversations.length - index}
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-h-0 flex-col">
        <header className="flex h-16 items-center justify-between border-b px-5">
          <div>
            <h1 className="font-semibold">Nullain Code</h1>
            <p className="text-xs text-muted-foreground">
              {state.conversationId
                ? state.connected
                  ? "Conectado"
                  : "Conectando…"
                : state.projectId
                  ? "Crie ou selecione uma conversa"
                  : "Crie ou selecione um projeto"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void logout()} title="Sair">
            <LogOutIcon />
          </Button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          {state.messages.map((message, index) => {
            const text = messageText(message);
            return text ? (
              <div
                key={(eventRecord(message)?.id as string) ?? index}
                className={`max-w-3xl whitespace-pre-wrap rounded-2xl p-4 text-sm leading-relaxed ${roleOf(message) === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {text}
              </div>
            ) : null;
          })}
          {pending && (
            <div className="max-w-3xl rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="font-medium">
                {pending.toolName === "submit_plan"
                  ? "Plano pronto para revisão"
                  : "O agente aguarda uma resposta"}
              </p>
              {pending.toolName !== "submit_plan" &&
                typeof pendingPayload?.question === "string" && (
                  <p className="mt-2 text-sm">{pendingPayload.question}</p>
                )}
              {typeof pending.plan === "string" && (
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-background p-3 text-xs leading-relaxed">
                  {pending.plan}
                </pre>
              )}
              {pending.toolName === "submit_plan" ? (
                <div className="mt-3 flex gap-2">
                  <Button disabled={deciding} onClick={() => void decide(true)}>
                    <CheckIcon /> {deciding ? "Enviando…" : "Aprovar"}
                  </Button>
                  <Button disabled={deciding} variant="outline" onClick={() => void decide(false)}>
                    <XIcon /> Recusar
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {pendingOptions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {pendingOptions.map((option) => {
                        const label = String(option.label ?? "");
                        const selected = selectedAnswers.includes(label);
                        return (
                          <Button
                            key={label}
                            type="button"
                            variant={selected ? "default" : "outline"}
                            onClick={() =>
                              setSelectedAnswers((current) =>
                                pendingPayload?.selectionMode === "multi_select"
                                  ? selected
                                    ? current.filter((item) => item !== label)
                                    : [...current, label]
                                  : [label],
                              )
                            }
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <Input
                      value={suspensionAnswer}
                      onChange={(event) => setSuspensionAnswer(event.target.value)}
                      placeholder="Digite sua resposta…"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") answerSuspension();
                      }}
                    />
                  )}
                  <Button disabled={deciding} onClick={answerSuspension}>
                    {deciding ? "Enviando…" : "Responder"}
                  </Button>
                </div>
              )}
            </div>
          )}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </div>
        <div className="border-t p-4">
          <div className="mx-auto flex max-w-4xl items-end gap-2">
            <Textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder={
                state.conversationId ? "Descreva a tarefa…" : "Crie uma conversa para começar"
              }
              disabled={!state.conversationId}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => void send()}
              disabled={!state.connected || state.busy}
            >
              <SendIcon />
            </Button>
            {state.busy && (
              <Button
                size="icon"
                variant="destructive"
                onClick={() =>
                  state.conversationId &&
                  void request(`/api/code/conversations/${state.conversationId}/cancel`, {
                    method: "POST",
                  }).then(() => set({ busy: false }))
                }
              >
                <CircleStopIcon />
              </Button>
            )}
          </div>
        </div>
      </section>
      <aside className="min-h-0 overflow-auto border-l p-4 max-xl:hidden">
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
        <h2 className="mb-3 mt-8 text-sm font-semibold">Alterar senha</h2>
        <div className="space-y-2">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Senha atual"
            value={passwords.current}
            onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Nova senha (12+ caracteres)"
            value={passwords.next}
            onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
          />
          <Button variant="outline" className="w-full" onClick={() => void changePassword()}>
            Atualizar senha
          </Button>
        </div>
        <h2 className="mb-2 mt-8 text-sm font-semibold">Eventos</h2>
        <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
          {state.events.slice(-20).map((event, index) => (
            <p key={index}>{String(eventRecord(event)?.type ?? "evento")}</p>
          ))}
        </div>
      </aside>
    </div>
  );
}
