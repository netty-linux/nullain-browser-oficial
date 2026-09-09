"use client";

import { makeAssistantDataUI, type DataMessagePartProps } from "@assistant-ui/react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { BotAvatar } from "./bot-avatar";
import { CHAT_MODEL_IDS } from "@/lib/model-catalog";

type Color = "ocean" | "violet" | "emerald" | "amber" | "rose" | "indigo";
type ReviewData = {
  version: 1;
  draftId: string;
  revision: number;
  snapshot: {
    name: string;
    description: string;
    objective: string;
    instructions: string;
    modelId: string;
    skillNames: string[];
    avatarColorToken: Color;
    pendingCapabilities: string[];
  };
};
type CreatedData = {
  version: 1;
  bot: { id: string; name: string; description: string; avatarColorToken: Color };
};

function BotReviewCard({ data }: DataMessagePartProps<ReviewData>) {
  const [state, setState] = useState<"loading" | "ready" | "stale" | "created" | "cancelled">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.snapshot.name);
  const [description, setDescription] = useState(data.snapshot.description);
  const [instructions, setInstructions] = useState(data.snapshot.instructions);
  const [modelId, setModelId] = useState(data.snapshot.modelId);
  const [skillNames, setSkillNames] = useState(data.snapshot.skillNames.join(", "));
  const [catalog, setCatalog] = useState<Array<{ name: string; description: string }>>([]);
  useEffect(() => {
    let current = true;
    void fetch(`/api/bots/drafts/${data.draftId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Revisão indisponível.");
        const body = await response.json();
        if (!current) return;
        if (body.draft.status === "created") setState("created");
        else if (body.draft.status === "cancelled") setState("cancelled");
        else setState(body.draft.revision === data.revision ? "ready" : "stale");
      })
      .catch((cause) => current && setError(cause instanceof Error ? cause.message : "Erro."));
    void fetch("/api/skills")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          skills?: Array<{ name: string; description: string }>;
        };
        if (current && Array.isArray(body.skills)) setCatalog(body.skills);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [data.draftId, data.revision]);
  const act = async (action: "confirm" | "cancel") => {
    if (busy || state !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        action === "confirm"
          ? `/api/bots/drafts/${data.draftId}/confirm`
          : `/api/bots/drafts/${data.draftId}`,
        {
          method: action === "confirm" ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: action === "confirm" ? JSON.stringify({ revision: data.revision }) : undefined,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Ação recusada.");
      }
      setState(action === "confirm" ? "created" : "cancelled");
      window.dispatchEvent(new Event("nullain-bot-changed"));
      window.dispatchEvent(new Event("nullain-transcript-refresh"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ação recusada.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (busy || state !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const parsedSkills = skillNames
        .split(",")
        .map((entry: string) => entry.trim().toLowerCase())
        .filter(Boolean);
      const response = await fetch(`/api/bots/drafts/${data.draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: data.revision,
          name,
          description,
          instructions,
          modelId,
          avatarColorToken: data.snapshot.avatarColorToken,
          skillNames: parsedSkills,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Ajuste recusado.");
      }
      setEditing(false);
      setState("stale");
      window.dispatchEvent(new Event("nullain-transcript-refresh"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ajuste recusado.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="my-3 max-w-xl rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <BotAvatar color={data.snapshot.avatarColorToken} name={data.snapshot.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{data.snapshot.name}</h3>
          <p className="text-sm text-muted-foreground">{data.snapshot.description}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Objetivo</dt>
          <dd>{data.snapshot.objective}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Modelo</dt>
          <dd className="truncate">{data.snapshot.modelId}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Instruções</dt>
          <dd>{data.snapshot.instructions}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Skills</dt>
          <dd>{data.snapshot.skillNames.join(", ") || "Nenhuma"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Capacidades pendentes</dt>
          <dd>Nenhuma concedida</dd>
        </div>
      </dl>
      {editing && (
        <div className="mt-4 grid gap-2">
          <label className="text-sm">
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Resumo
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-lg border bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Instruções
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-lg border bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Modelo
            <select
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
            >
              {CHAT_MODEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Skills (nomes separados por vírgula)
            <input
              value={skillNames}
              onChange={(event) => setSkillNames(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2"
              placeholder="ex.: commit-writer"
            />
          </label>
          {catalog.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Disponíveis: {catalog.map((skill) => skill.name).join(", ")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-lg bg-foreground px-3 py-2 text-sm text-background"
            >
              Salvar revisão
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-2 text-sm"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
      {state === "stale" && (
        <p className="mt-3 text-sm text-amber-500">Esta revisão está desatualizada.</p>
      )}
      {state === "created" && (
        <p className="mt-3 text-sm text-emerald-500">Bot criado com sucesso.</p>
      )}
      {state === "cancelled" && (
        <p className="mt-3 text-sm text-muted-foreground">Criação cancelada.</p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || state !== "ready"}
          onClick={() => void act("confirm")}
          className="rounded-lg bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Criar bot"}
        </button>
        <button
          type="button"
          disabled={busy || state !== "ready"}
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setEditing(true)}
        >
          Ajustar
        </button>
        <button
          type="button"
          disabled={busy || state !== "ready"}
          onClick={() => void act("cancel")}
          className="rounded-lg px-3 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

function BotCreatedCard({ data }: DataMessagePartProps<CreatedData>) {
  const open = () => {
    localStorage.setItem("nullain-active-bot-id", data.bot.id);
    localStorage.setItem("nullain-active-bot-conversation-id", crypto.randomUUID());
    window.dispatchEvent(new Event("nullain-bot-changed"));
  };
  return (
    <section className="my-3 max-w-xl rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-center gap-3">
        <BotAvatar color={data.bot.avatarColorToken} name={data.bot.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{data.bot.name}</h3>
          <p className="text-sm text-muted-foreground">{data.bot.description}</p>
        </div>
        <CheckCircle2 className="size-5 text-emerald-500" aria-label="Concluído" />
      </div>
      <button
        type="button"
        onClick={open}
        className="mt-4 rounded-lg bg-foreground px-3 py-2 text-sm text-background"
      >
        Conversar com este bot
      </button>
    </section>
  );
}

export const BotReviewDataUI = makeAssistantDataUI<ReviewData>({
  name: "bot-review",
  render: BotReviewCard,
});
export const BotCreatedDataUI = makeAssistantDataUI<CreatedData>({
  name: "bot-created",
  render: BotCreatedCard,
});
