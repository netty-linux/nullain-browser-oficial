"use client";

import { useEffect, useState, type FC } from "react";
import { CheckIcon, UploadIcon, TrashIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadDisabledSkills, saveDisabledSkills } from "@/lib/chat-model";

type SkillInfo = { name: string; description: string; user?: boolean };

/**
 * Painel de Skills da sidebar (aba própria, ícone de puzzle = peça que se
 * encaixa no agente). Lista todas as skills com toggle on/off por skill.
 *
 * Criação de skill: apenas por upload explícito de .md/.zip baseado no formato
 * Agent Skills.
 * NÃO existe formulário manual — o painel deixa isso explícito.
 */
export const SkillsPanel: FC = () => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((d: { skills?: SkillInfo[] }) => setSkills(d.skills ?? []))
      .catch(() => setSkills([]));
  };

  useEffect(() => {
    setDisabled(loadDisabledSkills());
    setHydrated(true);
    refresh();
  }, []);

  const toggle = (name: string) => {
    const next = disabled.includes(name) ? disabled.filter((n) => n !== name) : [...disabled, name];
    setDisabled(next);
    if (hydrated) saveDisabledSkills(next);
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/skills", { method: "POST", body: form });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        alert(d.error ?? "Falha no upload");
        return;
      }
      refresh();
    } catch {
      alert("Falha no upload");
    } finally {
      setBusy(false);
    }
  };

  const removeSkill = async (name: string) => {
    if (!confirm(`Deletar a skill "${name}"?`)) return;
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) {
        setSkills((prev) => prev.filter((s) => s.name !== name));
      } else {
        alert("Não foi possível deletar (skills builtin não são removíveis).");
      }
    } catch {
      alert("Falha ao deletar skill");
    }
  };

  return (
    <div className="flex h-full flex-col gap-1 px-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {skills.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">Nenhuma skill disponível.</div>
        ) : (
          skills.map((s) => {
            const enabled = !disabled.includes(s.name);
            return (
              <div key={s.name} className="group relative">
                <button
                  type="button"
                  onClick={() => toggle(s.name)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm tracking-tight transition-colors hover:bg-foreground/5",
                    s.user && "pr-8",
                  )}
                  aria-pressed={enabled}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      enabled
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {enabled && <CheckIcon className="size-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {s.name}
                      {s.user && (
                        <span className="ml-1.5 rounded bg-violet-500/15 px-1 py-px text-[10px] font-medium text-violet-600 dark:text-violet-400">
                          sua
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground line-clamp-2">
                      {s.description}
                    </span>
                  </span>
                </button>
                {s.user && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSkill(s.name);
                    }}
                    className="absolute top-1.5 right-1.5 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                    aria-label={`Deletar skill ${s.name}`}
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="px-1 pt-2 pb-1">
        <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
          {busy ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <UploadIcon className="size-3.5" />
          )}
          Upload de skill (.md ou .zip)
          <input
            type="file"
            accept=".md,.markdown,.zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
};
