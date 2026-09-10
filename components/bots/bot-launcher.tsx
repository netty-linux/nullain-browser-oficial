"use client";
import { useEffect, useState } from "react";
import {
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { BotAvatar, useActiveBotIdentity } from "./bot-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CHAT_MODEL_IDS } from "@/lib/model-catalog";

type Bot = {
  id: string;
  name: string;
  description: string;
  status: "ready" | "paused";
  revision: number;
  avatarColorToken: "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";
  isSystem: 0 | 1;
};
export function BotLauncher() {
  const [bots, setBots] = useState<Bot[]>([]),
    [open, setOpen] = useState(false),
    [objective, setObjective] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [managingId, setManagingId] = useState<string | null>(null),
    [manageBusy, setManageBusy] = useState(false),
    [manageError, setManageError] = useState(""),
    [editingBotId, setEditingBotId] = useState<string | null>(null),
    [editRevision, setEditRevision] = useState(1),
    [editName, setEditName] = useState(""),
    [editDescription, setEditDescription] = useState(""),
    [editInstructions, setEditInstructions] = useState(""),
    [editModel, setEditModel] = useState("ollama-cloud/gpt-oss:20b"),
    [editColor, setEditColor] = useState("ocean"),
    [editSkills, setEditSkills] = useState(""),
    [editCatalog, setEditCatalog] = useState<Array<{ name: string; description: string }>>([]),
    [editBusy, setEditBusy] = useState(false),
    [editError, setEditError] = useState("");
  // Identidade via contexto (hidratado pós-mount) — ler localStorage aqui
  // durante a renderização divergiria do SSR e quebraria a hidratação.
  const activeBot = useActiveBotIdentity();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = () =>
    fetch("/api/bots", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const loadedBots = (data?.bots ?? []) as Bot[];
        setBots(loadedBots);
        if (!localStorage.getItem("nullain-active-bot-id")) {
          const system = loadedBots.find((bot) => bot.isSystem);
          if (system) choose(system);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  useEffect(() => {
    load();
  }, []);
  function choose(bot: Bot) {
    const previous = localStorage.getItem("nullain-active-bot-id");
    localStorage.setItem("nullain-active-bot-id", bot.id);
    if (previous !== bot.id || !localStorage.getItem("nullain-active-bot-conversation-id"))
      localStorage.setItem("nullain-active-bot-conversation-id", crypto.randomUUID());
    window.dispatchEvent(new Event("nullain-bot-changed"));
  }
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const draftResponse = await fetch("/api/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective }),
      });
      const draftBody = await draftResponse.json();
      if (!draftResponse.ok) throw new Error(draftBody.error);
      const d = draftBody.draft;
      const review = await fetch(`/api/bots/drafts/${d.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: d.revision,
          name: d.name,
          description: d.description,
          instructions: d.instructions,
          modelId: d.modelId,
          avatarColorToken: d.avatarColorToken,
          skillNames: [],
        }),
      });
      const reviewed = await review.json();
      if (!review.ok) throw new Error(reviewed.error);
      const confirmed = await fetch(`/api/bots/drafts/${d.id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: reviewed.draft.revision }),
      });
      const created = await confirmed.json();
      if (!confirmed.ok) throw new Error(created.error);
      choose(created.bot);
      setOpen(false);
      setObjective("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o bot.");
    } finally {
      setBusy(false);
    }
  };
  const toggleStatus = async (bot: Bot) => {
    setManagingId(bot.id);
    setManageBusy(true);
    setManageError("");
    try {
      const response = await fetch(`/api/bots/${bot.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: bot.revision,
          status: bot.status === "paused" ? "ready" : "paused",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível atualizar o bot.");
      load();
    } catch (cause) {
      setManageError(cause instanceof Error ? cause.message : "Não foi possível atualizar o bot.");
    } finally {
      setManageBusy(false);
      setManagingId(null);
    }
  };
  const removeBot = async (bot: Bot) => {
    const confirmName = window.prompt(
      `Para excluir "${bot.name}" permanentemente, digite o nome exato do bot:`,
      "",
    );
    if (confirmName === null) return;
    setManagingId(bot.id);
    setManageBusy(true);
    setManageError("");
    try {
      const response = await fetch(`/api/bots/${bot.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Não foi possível excluir o bot.");
      }
      if (localStorage.getItem("nullain-active-bot-id") === bot.id) {
        localStorage.removeItem("nullain-active-bot-id");
        localStorage.removeItem("nullain-active-bot-conversation-id");
        window.dispatchEvent(new Event("nullain-bot-changed"));
      }
      load();
    } catch (cause) {
      setManageError(cause instanceof Error ? cause.message : "Não foi possível excluir o bot.");
    } finally {
      setManageBusy(false);
      setManagingId(null);
    }
  };
  const openEdit = async (bot: Bot) => {
    setEditingBotId(bot.id);
    setEditError("");
    setEditBusy(true);
    try {
      const response = await fetch(`/api/bots/${bot.id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o bot.");
      const detail = body as {
        bot: {
          name: string;
          description: string;
          instructions: string;
          modelId: string;
          avatarColorToken: "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";
          revision: number;
        };
        skillNames: string[];
      };
      setEditRevision(detail.bot.revision);
      setEditName(detail.bot.name);
      setEditDescription(detail.bot.description);
      setEditInstructions(detail.bot.instructions);
      setEditModel(detail.bot.modelId);
      setEditColor(detail.bot.avatarColorToken);
      setEditSkills((detail.skillNames ?? []).join(", "));
      void fetch("/api/skills", { cache: "no-store" })
        .then(async (skillsResponse) => {
          if (!skillsResponse.ok) return;
          const skillsBody = (await skillsResponse.json()) as {
            skills?: Array<{ name: string; description: string }>;
          };
          if (Array.isArray(skillsBody.skills)) setEditCatalog(skillsBody.skills);
        })
        .catch(() => {});
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Não foi possível carregar o bot.");
    } finally {
      setEditBusy(false);
    }
  };
  const saveEdit = async () => {
    if (!editingBotId) return;
    setEditBusy(true);
    setEditError("");
    try {
      const skillNames = editSkills
        .split(",")
        .map((entry: string) => entry.trim().toLowerCase())
        .filter(Boolean);
      const response = await fetch(`/api/bots/${editingBotId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: editRevision,
          name: editName,
          description: editDescription,
          instructions: editInstructions,
          modelId: editModel,
          avatarColorToken: editColor,
          skillNames,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível atualizar o bot.");
      setEditingBotId(null);
      load();
      if (localStorage.getItem("nullain-active-bot-id") === editingBotId)
        window.dispatchEvent(new Event("nullain-bot-changed"));
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Não foi possível atualizar o bot.");
    } finally {
      setEditBusy(false);
    }
  };
  return (
    <div className="mb-3 space-y-0.5 px-1">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Seus bots
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Criar bot"
          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <PlusIcon className="size-3.5" />
          Criar
        </button>
      </div>
      {manageError && <p className="px-2 py-1 text-xs text-destructive">{manageError}</p>}
      {loaded && bots.length === 0 && (
        <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
          Nenhum bot ainda. Crie o primeiro para começar.
        </p>
      )}
      {bots.map((bot) => {
        const active = activeBot?.id === bot.id;
        const paused = bot.status === "paused";
        const busy = manageBusy && managingId === bot.id;
        const menuOpen = menuFor === bot.id;
        return (
          <div
            key={bot.id}
            className={cn(
              "group flex w-full items-center gap-1 rounded-2xl transition-colors",
              active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
            )}
          >
            <button
              type="button"
              onClick={() => choose(bot)}
              aria-label={`Conversar com ${bot.name}`}
              aria-current={active}
              title={`Conversar com ${bot.name}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
            >
              <BotAvatar
                color={bot.avatarColorToken}
                name={bot.name}
                className="size-10 rounded-2xl"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-foreground">
                    {bot.name}
                  </span>
                  {paused ? (
                    <span className="shrink-0 text-xs text-muted-foreground/70">Pausado</span>
                  ) : active ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                      title="Bot ativo"
                      aria-label="Bot ativo"
                    />
                  ) : null}
                </span>
                <span className="block truncate text-[13px] leading-snug text-muted-foreground">
                  {bot.description}
                </span>
              </span>
            </button>
            {!bot.isSystem && (
              <Popover open={menuOpen} onOpenChange={(next) => setMenuFor(next ? bot.id : null)}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Opções de ${bot.name}`}
                      title="Opções"
                      className={cn(
                        "mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-all hover:bg-foreground/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                        menuOpen
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
                      )}
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-4" />
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={4} className="w-44 gap-0.5 p-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMenuFor(null);
                      void toggleStatus(bot);
                    }}
                    className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 disabled:opacity-50"
                  >
                    {paused ? (
                      <PlayIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <PauseIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 text-left">
                      {busy ? "Aguarde…" : paused ? "Retomar" : "Pausar"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      void openEdit(bot);
                    }}
                    className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5"
                  >
                    <PencilIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">Configurar</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMenuFor(null);
                      void removeBot(bot);
                    }}
                    className="text-destructive flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2Icon className="size-4 shrink-0" />
                    <span className="flex-1 text-left">Excluir</span>
                  </button>
                </PopoverContent>
              </Popover>
            )}
          </div>
        );
      })}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-tight">Criar bot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Em linguagem natural, descreva o objetivo permanente dele.
            </p>
            <label
              htmlFor="nullain-new-bot-objective"
              className="mt-4 block text-[13px] font-medium text-foreground/80"
            >
              Objetivo
            </label>
            <textarea
              id="nullain-new-bot-objective"
              autoFocus
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-1.5 min-h-28 w-full rounded-xl border border-border bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Ex.: acompanhar conteúdos e planejar publicações."
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="h-9 rounded-full px-4 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Cancelar
              </button>
              <button
                disabled={busy || !objective.trim()}
                onClick={create}
                className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background outline-none transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                {busy ? "Criando…" : "Revisar e criar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {editingBotId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configurar bot"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-tight">Configurar bot</h2>
            {editBusy && !editName ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <>
                <label className="mt-3 block text-[13px] font-medium text-foreground/80">
                  Nome
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
                <label className="mt-3 block text-[13px] font-medium text-foreground/80">
                  Resumo
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="mt-1.5 min-h-16 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
                <label className="mt-3 block text-[13px] font-medium text-foreground/80">
                  Instruções
                  <textarea
                    value={editInstructions}
                    onChange={(event) => setEditInstructions(event.target.value)}
                    className="mt-1.5 min-h-20 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
                <label className="mt-3 block text-[13px] font-medium text-foreground/80">
                  Modelo
                  <select
                    value={editModel}
                    onChange={(event) => setEditModel(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {CHAT_MODEL_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-[13px] font-medium text-foreground/80">
                  Cor de identificação
                  <select
                    value={editColor}
                    onChange={(event) => setEditColor(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {["ocean", "violet", "emerald", "amber", "rose", "indigo"].map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-[13px] font-medium text-foreground/80">
                  Skills (nomes separados por vírgula)
                  <input
                    value={editSkills}
                    onChange={(event) => setEditSkills(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    placeholder="ex.: skill-creator"
                  />
                </label>
                {editCatalog.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Disponíveis: {editCatalog.map((skill) => skill.name).join(", ")}
                  </p>
                )}
              </>
            )}
            {editError && <p className="mt-2 text-sm text-destructive">{editError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingBotId(null)}
                className="h-9 rounded-full px-4 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Fechar
              </button>
              <button
                disabled={editBusy || !editName.trim()}
                onClick={() => void saveEdit()}
                className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background outline-none transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                {editBusy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
