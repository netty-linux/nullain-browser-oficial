"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { LoaderCircleIcon, PuzzleIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import {
  applySkillCatalogDefaults,
  filterEnabledSkills,
  loadDisabledSkills,
} from "@/lib/chat-model";
import { cn } from "@/lib/utils";

export type SelectableSkill = {
  name: string;
  description: string;
  displayName: string;
  summary: string;
  source: "native" | "user";
};

type SkillSelectionValue = {
  selected: SelectableSkill | null;
  select: (skill: SelectableSkill) => void;
  clear: () => void;
};

const SkillSelectionContext = createContext<SkillSelectionValue | null>(null);

export function SkillSelectionProvider({ children }: PropsWithChildren) {
  const [selected, setSelected] = useState<SelectableSkill | null>(null);
  return (
    <SkillSelectionContext.Provider
      value={{ selected, select: setSelected, clear: () => setSelected(null) }}
    >
      {children}
    </SkillSelectionContext.Provider>
  );
}

export function useSkillSelection() {
  const value = useContext(SkillSelectionContext);
  if (!value) throw new Error("useSkillSelection must be used inside SkillSelectionProvider");
  return value;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slashQuery(text: string): string | null {
  if (
    !text.startsWith("/") ||
    text.startsWith("//") ||
    text.includes("`") ||
    /^[a-z]+:\/\//i.test(text)
  ) {
    return null;
  }
  const firstLine = text.split("\n", 1)[0];
  if (firstLine.includes("\\") || firstLine.slice(1).includes("/")) return null;
  return firstLine.match(/^\/([^\s]*)/)?.[1] ?? "";
}

export function ComposerSkillSelector() {
  const aui = useAui();
  const text = useAuiState((state) => state.composer.text);
  const { selected, select, clear } = useSkillSelection();
  const [skills, setSkills] = useState<SelectableSkill[]>([]);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const query = selected ? null : slashQuery(text);
  const open = query !== null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/skills", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        skills?: Array<
          Partial<SelectableSkill> & { name: string; description: string; user?: boolean }
        >;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar as skills.");
      const catalog = (payload.skills ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description,
        displayName: skill.displayName || skill.name,
        summary: skill.summary || skill.description,
        source: skill.source || (skill.user ? "user" : "native"),
      }));
      setSkills(catalog);
      setDisabled(applySkillCatalogDefaults(catalog));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as skills.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && skills.length === 0 && !loading && !error) void load();
  }, [open, skills.length, loading, error, load]);

  useEffect(() => {
    const refresh = () => {
      setSkills([]);
      setDisabled(loadDisabledSkills());
    };
    window.addEventListener("nullain-skills-changed", refresh);
    return () => window.removeEventListener("nullain-skills-changed", refresh);
  }, []);

  const filtered = useMemo(() => {
    const needle = normalize(query ?? "").trim();
    const enabledSkills = filterEnabledSkills(skills, disabled);
    if (!needle) return enabledSkills;
    return enabledSkills.filter((skill) =>
      normalize(`${skill.name} ${skill.displayName} ${skill.summary}`).includes(needle),
    );
  }, [query, skills, disabled]);

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (skill: SelectableSkill) => {
    select(skill);
    aui.composer.setText(text.replace(/^\/[^\s\n]*\s?/, ""));
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>(".aui-composer-input")?.focus(),
    );
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof HTMLTextAreaElement) ||
        !event.target.matches(".aui-composer-input")
      )
        return;
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && filtered.length) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => (index + direction + filtered.length) % filtered.length);
      } else if (event.key === "Enter" && filtered.length) {
        event.preventDefault();
        event.stopPropagation();
        choose(filtered[activeIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        aui.composer.setText(text.slice(1));
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, filtered, activeIndex, aui, text]);

  return (
    <>
      {selected && (
        <div className="px-3 pt-1.5">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.055] py-1 pr-1 pl-2.5 text-xs">
            <PuzzleIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{selected.displayName}</span>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground outline-none hover:bg-foreground/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remover skill ${selected.displayName}`}
              onClick={clear}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        </div>
      )}

      {open && (
        <div
          className="absolute right-0 bottom-[calc(100%+0.5rem)] left-0 z-50 overflow-hidden rounded-2xl border border-foreground/10 bg-popover shadow-2xl"
          role="listbox"
          aria-label="Selecionar skill"
        >
          <div className="flex items-center justify-between border-b border-foreground/8 px-3 py-2">
            <span className="text-xs font-semibold">Usar uma skill nesta mensagem</span>
            <Link href="/skills" className="text-xs text-muted-foreground hover:text-foreground">
              Gerenciar
            </Link>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {loading ? (
              <div
                className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircleIcon className="size-4 animate-spin" /> Carregando skills…
              </div>
            ) : error ? (
              <div className="p-3 text-sm" role="alert">
                <p className="text-destructive">{error}</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => void load()}>
                  <RotateCwIcon /> Tentar novamente
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                <p>{query ? "Nenhuma skill ativa encontrada." : "Nenhuma skill ativa."}</p>
                <Link href="/skills" className="mt-1 inline-block text-foreground hover:underline">
                  Gerenciar skills
                </Link>
              </div>
            ) : (
              filtered.map((skill, index) => (
                <button
                  key={skill.name}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(skill)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none",
                    index === activeIndex && "bg-foreground/[0.06]",
                  )}
                >
                  <PuzzleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{skill.displayName}</span>
                      {skill.source === "native" && (
                        <span className="rounded-full bg-foreground/7 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          Nativa
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {skill.summary}
                    </span>
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">{skill.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
