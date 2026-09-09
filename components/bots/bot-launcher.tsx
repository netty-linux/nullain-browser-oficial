"use client";
import { useEffect, useState } from "react";
import { BotAvatar } from "./bot-avatar";
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
  const load = () =>
    fetch("/api/bots")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const loaded = (data?.bots ?? []) as Bot[];
        setBots(loaded);
        if (!localStorage.getItem("nullain-active-bot-id")) {
          const system = loaded.find((bot) => bot.isSystem);
          if (system) choose(system);
        }
      })
      .catch(() => {});
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
    <div className="mb-3 space-y-1 px-1">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>SEUS BOTS</span>
        <button onClick={() => setOpen(true)} className="text-foreground hover:underline">
          Criar
        </button>
      </div>
      {manageError && <p className="px-1 text-xs text-destructive">{manageError}</p>}
      {bots.map((bot) => {
        const active =
          typeof window !== "undefined" && localStorage.getItem("nullain-active-bot-id") === bot.id;
        return (
          <div
            key={bot.id}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/5"
          >
            <button
              onClick={() => choose(bot)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <BotAvatar color={bot.avatarColorToken} name={bot.name} className="size-6" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {bot.name}
                  {bot.status === "paused" ? " (pausado)" : ""}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {bot.description}
                </span>
              </span>
            </button>
            {!bot.isSystem && (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={manageBusy && managingId === bot.id}
                  onClick={() => void toggleStatus(bot)}
                  title={bot.status === "paused" ? "Retomar bot" : "Pausar bot"}
                  aria-label={
                    bot.status === "paused" ? `Retomar ${bot.name}` : `Pausar ${bot.name}`
                  }
                  aria-pressed={active}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-50"
                >
                  {manageBusy && managingId === bot.id
                    ? "…"
                    : bot.status === "paused"
                      ? "Retomar"
                      : "Pausar"}
                </button>
                <button
                  type="button"
                  onClick={() => void openEdit(bot)}
                  title={`Configurar ${bot.name}`}
                  aria-label={`Configurar ${bot.name}`}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                >
                  Configurar
                </button>
                <button
                  type="button"
                  disabled={manageBusy && managingId === bot.id}
                  onClick={() => void removeBot(bot)}
                  title={`Excluir ${bot.name}`}
                  aria-label={`Excluir ${bot.name}`}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  Excluir
                </button>
              </span>
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
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Criar bot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Em linguagem natural, descreva o objetivo permanente dele.
            </p>
            <textarea
              autoFocus
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-4 min-h-28 w-full rounded-lg border bg-transparent p-3"
              placeholder="Ex.: acompanhar conteúdos e planejar publicações."
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2">
                Cancelar
              </button>
              <button
                disabled={busy || !objective.trim()}
                onClick={create}
                className="rounded-lg bg-foreground px-3 py-2 text-background disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Configurar bot</h2>
            {editBusy && !editName ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <>
                <label className="mt-2 block text-sm">
                  Nome
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
                  />
                </label>
                <label className="mt-2 block text-sm">
                  Resumo
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="mt-1 min-h-16 w-full rounded-lg border bg-transparent px-3 py-2"
                  />
                </label>
                <label className="mt-2 block text-sm">
                  Instruções
                  <textarea
                    value={editInstructions}
                    onChange={(event) => setEditInstructions(event.target.value)}
                    className="mt-1 min-h-20 w-full rounded-lg border bg-transparent px-3 py-2"
                  />
                </label>
                <label className="mt-2 block text-sm">
                  Modelo
                  <select
                    value={editModel}
                    onChange={(event) => setEditModel(event.target.value)}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
                  >
                    {CHAT_MODEL_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block text-sm">
                  Cor de identificação
                  <select
                    value={editColor}
                    onChange={(event) => setEditColor(event.target.value)}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
                  >
                    {["ocean", "violet", "emerald", "amber", "rose", "indigo"].map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block text-sm">
                  Skills (nomes separados por vírgula)
                  <input
                    value={editSkills}
                    onChange={(event) => setEditSkills(event.target.value)}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
                    placeholder="ex.: commit-writer"
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
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditingBotId(null)} className="rounded-lg px-3 py-2">
                Fechar
              </button>
              <button
                disabled={editBusy || !editName.trim()}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-foreground px-3 py-2 text-background disabled:opacity-50"
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
