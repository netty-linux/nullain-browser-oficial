"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActivityIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleStopIcon,
  ClipboardIcon,
  FileSearchIcon,
  FileTextIcon,
  FilesIcon,
  FolderIcon,
  FolderPlusIcon,
  GitCompareArrowsIcon,
  LogOutIcon,
  MenuIcon,
  PanelRightIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon,
  TerminalIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  useNullainCodeStore,
  type CodeConversation,
  type CodeDisplayState,
  type CodeProject,
  type CodeWorkspaceChange,
  type CodeWorkspaceSnapshot,
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

function displayStateOf(raw: unknown): CodeDisplayState | undefined {
  const record = eventRecord(raw);
  if (!record) return undefined;
  return {
    isRunning: Boolean(record.isRunning),
    activeTools: (eventRecord(record.activeTools) ?? {}) as CodeDisplayState["activeTools"],
    tasks: Array.isArray(record.tasks) ? (record.tasks as CodeDisplayState["tasks"]) : [],
  };
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    view: "Lendo arquivo",
    list_files: "Mapeando arquivos",
    find_files: "Localizando arquivos",
    search_content: "Pesquisando no projeto",
    file_stat: "Inspecionando arquivo",
    write_file: "Gravando arquivo",
    string_replace_lsp: "Editando arquivo",
    delete_file: "Excluindo arquivo",
    mkdir: "Criando pasta",
    submit_plan: "Preparando plano",
    ask_user: "Aguardando resposta",
    task_write: "Organizando etapas",
    task_update: "Atualizando progresso",
    task_complete: "Concluindo etapa",
    task_check: "Verificando etapas",
  };
  return labels[name] ?? name.replaceAll("_", " ");
}

function DiffViewer({ change }: { change?: CodeWorkspaceChange }) {
  if (!change) return null;
  if (change.binary || change.truncated || !change.patch) {
    return (
      <div className="flex min-h-44 flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
        {change.binary
          ? "Arquivo binário alterado. A prévia textual não está disponível."
          : "Alteração muito grande para a prévia. O arquivo continua listado no resultado."}
      </div>
    );
  }
  return (
    <pre className="min-h-0 flex-1 overflow-auto bg-black/15 py-2 font-mono text-[11px] leading-5">
      {change.patch.split("\n").map((line, index) => (
        <span
          key={`${index}-${line.slice(0, 12)}`}
          className={cn(
            "block min-w-max px-3",
            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/10 text-emerald-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-red-500/10 text-red-300",
            line.startsWith("@@") && "bg-sky-500/8 text-sky-300",
            (line.startsWith("---") || line.startsWith("+++")) && "text-muted-foreground",
          )}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [workPanelOpen, setWorkPanelOpen] = useState(false);
  const [mobileWorkPanelOpen, setMobileWorkPanelOpen] = useState(false);
  const [workTab, setWorkTab] = useState<"files" | "changes" | "terminal">("changes");
  const [selectedChangePath, setSelectedChangePath] = useState<string>();
  const [deleteCandidate, setDeleteCandidate] = useState<CodeConversation>();
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
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

  const hydrateWorkspace = useCallback(
    async (conversationId: string) => {
      const body = (await request(
        `/api/code/conversations/${conversationId}/workspace`,
      )) as CodeWorkspaceSnapshot;
      set({ workspace: body });
      const firstChange = body.changes[0]?.path;
      if (firstChange) setSelectedChangePath((current) => current ?? firstChange);
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
        set({
          conversations,
          conversationId: conversations[0]?.id,
          messages: [],
          events: [],
          displayState: undefined,
          workspace: undefined,
        });
      })
      .catch((error) => set({ error: error.message }));
  }, [request, set, state.projectId]);

  useEffect(() => {
    source.current?.close();
    set({
      connected: false,
      messages: [],
      events: [],
      displayState: undefined,
      workspace: undefined,
    });
    if (!state.conversationId) return;
    const conversationId = state.conversationId;
    const next = new EventSource(`/api/code/conversations/${conversationId}/events`);
    source.current = next;
    next.addEventListener("ready", (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as {
        pending?: unknown[];
        displayState?: unknown;
      };
      const displayState = displayStateOf(snapshot.displayState);
      set({
        connected: true,
        events: snapshot.pending ?? [],
        displayState,
        busy: Boolean(displayState?.isRunning),
      });
      void hydrateMessages(conversationId);
      void hydrateWorkspace(conversationId);
    });
    next.addEventListener("controller", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as unknown;
      const record = eventRecord(parsed);
      set({ events: [...useNullainCodeStore.getState().events.slice(-199), parsed] });
      if (record?.type === "display_state_changed") {
        set({ displayState: displayStateOf(record.displayState) });
      }
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
      if (record?.type === "tool_end" || record?.type === "agent_end") {
        void hydrateWorkspace(conversationId);
      }
      if (record?.type === "agent_end" || record?.type === "error") set({ busy: false });
    });
    next.addEventListener("auth-revoked", () => router.replace("/code/login"));
    next.onerror = () => set({ connected: false });
    return () => next.close();
  }, [hydrateMessages, hydrateWorkspace, router, set, state.conversationId]);

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
  const selectedProject = state.projects.find((project) => project.id === state.projectId);
  const tasks = state.displayState?.tasks ?? [];
  const activeTools = Object.values(state.displayState?.activeTools ?? {}).filter(
    (tool) => tool.status === "running" || tool.status === "streaming_input",
  );
  const selectedChange = state.workspace?.changes.find(
    (change) => change.path === selectedChangePath,
  );
  const lastAgentEnd = [...state.events]
    .reverse()
    .map(eventRecord)
    .find((event) => event?.type === "agent_end" && event.reason !== "suspended");

  useEffect(() => {
    const changes = state.workspace?.changes ?? [];
    if (!changes.length) {
      setSelectedChangePath(undefined);
      return;
    }
    if (!changes.some((change) => change.path === selectedChangePath)) {
      setSelectedChangePath(changes[0].path);
    }
  }, [selectedChangePath, state.workspace?.changes]);

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

  async function createConversation(initialComposer?: string) {
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
      if (initialComposer) setComposer(initialComposer);
      setMobileNavigationOpen(false);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Falha ao criar conversa." });
    }
  }

  async function deleteTask() {
    if (!deleteCandidate) return;
    setDeletingConversation(true);
    try {
      await request(`/api/code/conversations/${deleteCandidate.id}`, { method: "DELETE" });
      const deletedIndex = state.conversations.findIndex(
        (conversation) => conversation.id === deleteCandidate.id,
      );
      const remaining = state.conversations.filter(
        (conversation) => conversation.id !== deleteCandidate.id,
      );
      const nextConversationId =
        state.conversationId === deleteCandidate.id
          ? remaining[Math.min(deletedIndex, remaining.length - 1)]?.id
          : state.conversationId;
      set({
        conversations: remaining,
        conversationId: nextConversationId,
        messages: nextConversationId === state.conversationId ? state.messages : [],
        events: nextConversationId === state.conversationId ? state.events : [],
        error: undefined,
      });
      setDeleteCandidate(undefined);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Falha ao excluir a tarefa." });
    } finally {
      setDeletingConversation(false);
    }
  }

  async function send() {
    if (!state.conversationId || !state.connected || !composer.trim()) return;
    const content = composer;
    setComposer("");
    set({
      busy: true,
      error: undefined,
      workspace: state.workspace ? { ...state.workspace, changes: [], running: true } : undefined,
    });
    setSelectedChangePath(undefined);
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

  async function copyProjectPath() {
    if (!selectedProject?.directoryPath) return;
    await navigator.clipboard.writeText(selectedProject.directoryPath);
    setCopiedPath(true);
    window.setTimeout(() => setCopiedPath(false), 1600);
  }

  const suggestionItems = [
    {
      label: "Entender este projeto",
      prompt:
        "Explore os arquivos deste projeto e me explique sua estrutura, tecnologias e fluxo principal.",
      Icon: FileSearchIcon,
    },
    {
      label: "Investigar um erro",
      prompt: "Quero investigar um erro neste projeto. Primeiro me peça os detalhes necessários.",
      Icon: BugIcon,
    },
    {
      label: "Planejar uma alteração",
      prompt: "Quero planejar uma alteração neste projeto sem modificar arquivos ainda.",
      Icon: SparklesIcon,
    },
  ];

  const taskNavigation = (mobile = false) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Tarefas
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {selectedProject?.name ?? "Nenhum projeto"}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="outline"
          className="rounded-lg"
          onClick={() => void createConversation()}
          disabled={!state.projectId}
          aria-label="Criar nova tarefa"
          title="Nova tarefa"
        >
          <PlusIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2">
        {state.conversations.length === 0 ? (
          <p className="px-2 py-5 text-xs leading-relaxed text-muted-foreground">
            As tarefas deste projeto aparecerão aqui.
          </p>
        ) : (
          state.conversations.map((conversation, index) => (
            <div key={conversation.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  set({ conversationId: conversation.id });
                  if (mobile) setMobileNavigationOpen(false);
                }}
                className={cn(
                  "min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  state.conversationId === conversation.id
                    ? "bg-foreground/[0.07] font-medium"
                    : "text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                Tarefa {state.conversations.length - index}
              </button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground opacity-60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                onClick={() => setDeleteCandidate(conversation)}
                aria-label={`Excluir Tarefa ${state.conversations.length - index}`}
                title="Excluir tarefa"
              >
                <Trash2Icon />
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-foreground/8 p-3">
        <Button
          variant="outline"
          className="w-full justify-start rounded-xl"
          onClick={() => void createConversation()}
          disabled={!state.projectId}
        >
          <PlusIcon /> Nova tarefa
        </Button>
      </div>
    </div>
  );

  function openWorkPanel(tab: "files" | "changes" | "terminal") {
    setWorkTab(tab);
    if (window.matchMedia("(max-width: 1279px)").matches) setMobileWorkPanelOpen(true);
    else setWorkPanelOpen(true);
  }

  const workPanelContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-foreground/8 px-3 py-2.5">
        <div className="flex items-center gap-1">
          {(
            [
              ["files", "Arquivos", FilesIcon],
              ["changes", "Alterações", GitCompareArrowsIcon],
              ["terminal", "Terminal", TerminalIcon],
            ] as const
          ).map(([tab, label, Icon]) => (
            <Button
              key={tab}
              size="sm"
              variant={workTab === tab ? "secondary" : "ghost"}
              className="gap-1.5 rounded-lg px-2.5"
              onClick={() => setWorkTab(tab)}
            >
              <Icon className="size-3.5" />
              <span className="max-sm:sr-only">{label}</span>
              {tab === "changes" && Boolean(state.workspace?.changes.length) && (
                <span className="rounded-full bg-foreground/8 px-1.5 text-[10px]">
                  {state.workspace?.changes.length}
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => state.conversationId && void hydrateWorkspace(state.conversationId)}
            aria-label="Atualizar painel de trabalho"
            title="Atualizar"
          >
            <RefreshCwIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setWorkPanelOpen(false);
              setMobileWorkPanelOpen(false);
            }}
            aria-label="Fechar painel de trabalho"
            title="Fechar"
          >
            <XIcon />
          </Button>
        </div>
      </div>

      {workTab === "files" ? (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {!state.workspace ? (
            <p className="p-3 text-xs text-muted-foreground">Carregando arquivos…</p>
          ) : state.workspace.files.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center">
              <FilesIcon className="size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Projeto vazio</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Os arquivos criados pelo agente aparecerão aqui.
              </p>
            </div>
          ) : (
            <>
              {state.workspace.files.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-foreground/[0.04]"
                >
                  {file.type === "directory" ? (
                    <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={file.path}>
                    {file.path}
                  </span>
                </div>
              ))}
              {state.workspace.filesTruncated && (
                <p className="p-2 text-[11px] text-muted-foreground">
                  Lista limitada aos primeiros 500 itens.
                </p>
              )}
            </>
          )}
        </div>
      ) : workTab === "changes" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {!state.workspace?.changes.length ? (
            <div className="flex min-h-52 flex-1 flex-col items-center justify-center px-6 text-center">
              <GitCompareArrowsIcon className="size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Nenhuma alteração nesta execução</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O diff aparecerá depois que o plano for aprovado e arquivos forem modificados.
              </p>
            </div>
          ) : (
            <>
              <div className="max-h-44 overflow-auto border-b border-foreground/8 p-2">
                {state.workspace.changes.map((change) => (
                  <button
                    key={change.path}
                    type="button"
                    onClick={() => setSelectedChangePath(change.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring",
                      selectedChangePath === change.path && "bg-foreground/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 shrink-0 text-center font-mono font-semibold",
                        change.status === "added"
                          ? "text-emerald-500"
                          : change.status === "deleted"
                            ? "text-red-500"
                            : "text-amber-500",
                      )}
                    >
                      {change.status === "added" ? "A" : change.status === "deleted" ? "D" : "M"}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={change.path}>
                      {change.path}
                    </span>
                  </button>
                ))}
              </div>
              <DiffViewer change={selectedChange} />
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-52 flex-1 flex-col items-center justify-center px-7 text-center">
          <TerminalIcon className="size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Terminal indisponível</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Este controlador seguro não possui acesso a comandos, subprocessos ou Git. Nenhum teste
            é marcado como executado sem evidência real.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[13.5rem_minmax(0,1fr)] max-md:grid-cols-1">
      <aside className="min-h-0 border-r border-foreground/8 bg-card/25 py-3 max-md:hidden">
        {taskNavigation()}
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex min-h-[4.75rem] items-center justify-between gap-3 border-b border-foreground/8 px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 md:hidden"
              onClick={() => setMobileNavigationOpen(true)}
              aria-label="Abrir tarefas"
            >
              <MenuIcon />
            </Button>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-auto min-w-0 justify-start gap-2 rounded-xl px-2 py-1.5"
                  />
                }
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-semibold">
                  {selectedProject?.name ?? "Selecionar projeto"}
                </span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-72 p-2">
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Projetos</p>
                <div className="max-h-52 space-y-1 overflow-auto">
                  {state.projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => set({ projectId: project.id })}
                      className={cn(
                        "w-full rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5",
                        project.id === state.projectId && "bg-foreground/[0.07] font-medium",
                      )}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2 border-t border-foreground/8 pt-2">
                  <Input
                    placeholder="Novo projeto"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && projectName.trim()) void createProject();
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={() => void createProject()}
                    disabled={!projectName.trim()}
                    aria-label="Criar projeto"
                  >
                    <FolderPlusIcon />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {selectedProject && (
              <div className="hidden min-w-0 border-l border-foreground/10 pl-3 lg:block">
                <button
                  type="button"
                  onClick={() => void copyProjectPath()}
                  title={selectedProject.directoryPath}
                  className="flex max-w-[34vw] items-center gap-1.5 truncate text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{selectedProject.directoryPath}</span>
                  <ClipboardIcon className="size-3 shrink-0" />
                </button>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {copiedPath ? "Caminho copiado" : "Acesso limitado a esta pasta"}
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="mr-1 hidden items-center gap-2 rounded-full border border-foreground/8 px-2.5 py-1.5 text-xs sm:flex">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  state.connected ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              {state.busy
                ? "Agente executando"
                : state.conversationId
                  ? state.connected
                    ? "Workspace conectado"
                    : "Reconectando"
                  : "Sem tarefa ativa"}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openWorkPanel(workTab)}
              title="Painel de trabalho"
              aria-label="Abrir painel de trabalho"
              className="relative"
            >
              <PanelRightIcon />
              {Boolean(state.workspace?.changes.length) && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                  {Math.min(state.workspace?.changes.length ?? 0, 9)}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setActivityOpen(true)}
              title="Atividade"
              aria-label="Abrir atividade"
            >
              <ActivityIcon />
            </Button>
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Abrir conta" title="Conta" />
                }
              >
                <UserRoundIcon />
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-72 p-3">
                <div className="flex items-start gap-2.5 border-b border-foreground/8 pb-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-foreground/7">
                    <UserRoundIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <div className="py-3">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <SettingsIcon className="size-3.5" /> Alterar senha
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Senha atual"
                      value={passwords.current}
                      onChange={(event) =>
                        setPasswords({ ...passwords, current: event.target.value })
                      }
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Nova senha (12+ caracteres)"
                      value={passwords.next}
                      onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => void changePassword()}
                    >
                      Atualizar senha
                    </Button>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive"
                  onClick={() => void logout()}
                >
                  <LogOutIcon /> Sair
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 sm:p-7">
              {!selectedProject ? (
                <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center text-center">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-foreground/6">
                    <FolderPlusIcon className="size-5 text-muted-foreground" />
                  </span>
                  <h2 className="mt-4 text-xl font-semibold tracking-tight">
                    Crie um projeto para começar
                  </h2>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    A Nullain criará uma pasta isolada no seu workspace local para trabalhar com
                    segurança.
                  </p>
                  <div className="mt-5 flex w-full max-w-sm gap-2">
                    <Input
                      placeholder="Nome do projeto"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && projectName.trim()) void createProject();
                      }}
                    />
                    <Button onClick={() => void createProject()} disabled={!projectName.trim()}>
                      Criar projeto
                    </Button>
                  </div>
                </div>
              ) : !state.conversationId ||
                (state.messages.length === 0 && !state.busy && !pending) ? (
                <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center text-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedProject.name}
                  </span>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    O que vamos fazer neste projeto?
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                    Peça uma mudança, investigue um problema ou explore os arquivos. As sugestões
                    apenas preenchem o campo — você decide quando enviar.
                  </p>
                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
                    {suggestionItems.map(({ label, prompt, Icon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          state.conversationId
                            ? setComposer(prompt)
                            : void createConversation(prompt)
                        }
                        className="rounded-2xl border border-foreground/10 bg-card/40 p-4 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="mt-3 block text-sm font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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
              {(state.busy || activeTools.length > 0 || tasks.length > 0) && (
                <div className="max-w-3xl rounded-2xl border border-foreground/10 bg-card/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">
                      {state.busy ? "Trabalhando na tarefa" : "Etapas da tarefa"}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setActivityOpen(true)}
                    >
                      Ver atividade
                    </Button>
                  </div>
                  {activeTools.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {activeTools.map((tool, index) => (
                        <div
                          key={`${tool.name}-${index}`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <RefreshCwIcon className="size-3.5 animate-spin text-sky-400" />
                          <span>{toolLabel(tool.name)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tasks.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-2 text-xs">
                          <span
                            className={cn(
                              "mt-1 size-2 shrink-0 rounded-full border",
                              task.status === "completed"
                                ? "border-emerald-500 bg-emerald-500"
                                : task.status === "in_progress"
                                  ? "border-sky-400 bg-sky-400"
                                  : "border-muted-foreground/50",
                            )}
                          />
                          <span
                            className={cn(
                              "leading-relaxed",
                              task.status === "completed" && "text-muted-foreground line-through",
                            )}
                          >
                            {task.status === "in_progress" ? task.activeForm : task.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                      <Button
                        disabled={deciding}
                        variant="outline"
                        onClick={() => void decide(false)}
                      >
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
              {!state.busy &&
                lastAgentEnd &&
                Boolean((state.workspace?.changes.length ?? 0) || tasks.length) && (
                  <div className="max-w-3xl rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                    <p className="text-sm font-semibold">
                      {lastAgentEnd.reason === "error"
                        ? "Execução encerrada com erro"
                        : lastAgentEnd.reason === "aborted"
                          ? "Execução interrompida"
                          : "Alterações aplicadas"}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-foreground">
                          {state.workspace?.changes.length ?? 0}
                        </span>{" "}
                        arquivo(s) alterado(s)
                      </p>
                      <p>
                        <span className="font-medium text-foreground">
                          {tasks.filter((task) => task.status === "completed").length}/
                          {tasks.length}
                        </span>{" "}
                        etapa(s) concluída(s)
                      </p>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Verificações automatizadas não executadas: este controlador não possui
                      terminal.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => openWorkPanel("changes")}
                    >
                      <GitCompareArrowsIcon /> Revisar alterações
                    </Button>
                  </div>
                )}
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            </div>
            <div className="border-t border-foreground/8 bg-background/90 p-3 sm:p-4">
              <div className="mx-auto max-w-4xl rounded-2xl border border-foreground/12 bg-card/35 p-2 shadow-sm">
                <Textarea
                  className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder={
                    state.conversationId
                      ? "Descreva o que deseja construir ou corrigir…"
                      : "Crie uma tarefa para começar"
                  }
                  disabled={!state.conversationId}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-3 border-t border-foreground/8 px-1 pt-2">
                  <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {selectedProject
                      ? `Trabalhando somente em ${selectedProject.name}`
                      : "Selecione um projeto para começar"}
                  </p>
                  {state.busy ? (
                    <Button
                      size="icon-sm"
                      variant="destructive"
                      aria-label="Interromper agente"
                      title="Interromper"
                      onClick={() =>
                        state.conversationId &&
                        void request(`/api/code/conversations/${state.conversationId}/cancel`, {
                          method: "POST",
                        }).then(() => set({ busy: false }))
                      }
                    >
                      <CircleStopIcon />
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      className="rounded-full"
                      onClick={() => void send()}
                      disabled={!state.connected || !composer.trim()}
                      aria-label="Enviar tarefa"
                    >
                      <SendIcon />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {workPanelOpen && (
            <aside className="hidden w-[28rem] min-w-0 border-l border-foreground/8 bg-card/20 xl:block">
              {workPanelContent}
            </aside>
          )}
        </div>
      </section>

      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent side="left" className="w-[86%] max-w-sm p-0">
          <SheetHeader className="border-b border-foreground/8">
            <SheetTitle>Nullain Code</SheetTitle>
            <SheetDescription>Projetos e tarefas do workspace.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 py-3">{taskNavigation(true)}</div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open && !deletingConversation) setDeleteCandidate(undefined);
        }}
      >
        <DialogContent showCloseButton={!deletingConversation}>
          <DialogHeader>
            <DialogTitle>Excluir esta tarefa?</DialogTitle>
            <DialogDescription>
              O histórico, as decisões e os registros de execução desta tarefa serão removidos. Os
              arquivos já alterados no projeto não serão desfeitos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deletingConversation}
              onClick={() => setDeleteCandidate(undefined)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deletingConversation}
              onClick={() => void deleteTask()}
            >
              <Trash2Icon /> {deletingConversation ? "Excluindo…" : "Excluir tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={mobileWorkPanelOpen} onOpenChange={setMobileWorkPanelOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-[94%] max-w-xl gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Painel de trabalho</SheetTitle>
            <SheetDescription>Arquivos e alterações da tarefa atual.</SheetDescription>
          </SheetHeader>
          {workPanelContent}
        </SheetContent>
      </Sheet>

      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent side="right" className="w-[92%] max-w-md p-0">
          <SheetHeader className="border-b border-foreground/8 p-5">
            <SheetTitle>Atividade</SheetTitle>
            <SheetDescription>
              Eventos técnicos da tarefa atual, disponíveis quando você precisar investigar.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {state.events.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center text-center">
                <ActivityIcon className="size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Nenhuma atividade ainda</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Os eventos da execução aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {state.events
                  .slice(-50)
                  .reverse()
                  .map((event, index) => {
                    const record = eventRecord(event);
                    const type = String(record?.type ?? "evento");
                    return (
                      <details
                        key={`${type}-${index}`}
                        className="rounded-xl border border-foreground/8 bg-card/40 px-3 py-2"
                      >
                        <summary className="cursor-pointer text-xs font-medium">{type}</summary>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-muted-foreground">
                          {JSON.stringify(event, null, 2)}
                        </pre>
                      </details>
                    );
                  })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
