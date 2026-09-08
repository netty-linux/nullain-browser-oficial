"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Code2Icon,
  CopyIcon,
  FileArchiveIcon,
  FileCode2Icon,
  FileTextIcon,
  FolderOpenIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PuzzleIcon,
  RotateCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  applySkillCatalogDefaults,
  forgetSkillPreference,
  loadDisabledSkills,
  markNewSkillDisabled,
  saveDisabledSkills,
} from "@/lib/chat-model";
import { cn } from "@/lib/utils";

type SkillInfo = {
  name: string;
  description: string;
  displayName?: string;
  summary?: string;
  source?: "native" | "user";
  user?: boolean;
  native?: boolean;
  resourceCount?: number;
  resourceKinds?: string[];
};
type SkillFile = { path: string; size: number };
type SkillDetails = SkillInfo & {
  body: string;
  document: string;
  frontmatter: Record<string, unknown>;
  files: SkillFile[];
};
type Notice = { id: number; tone: "success" | "error"; message: string };
type CatalogFilter = "all" | "native" | "user" | "scripts" | "templates";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".zip"];

function getUploadError(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return "Arquivo inválido. Envie uma skill em .md, .markdown ou .zip.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "O arquivo excede o limite de 5 MB.";
  return null;
}

function SkillSwitch({
  checked,
  name,
  onCheckedChange,
}: {
  checked: boolean;
  name: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${checked ? "Desativar" : "Ativar"} ${name} para o agente`}
      onClick={(event) => {
        event.stopPropagation();
        onCheckedChange(!checked);
      }}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        checked
          ? "border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500"
          : "border-foreground/15 bg-foreground/12",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0.5 top-0.5 size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.35)] transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function fileIcon(path: string) {
  if (path.startsWith("scripts/")) return Code2Icon;
  if (path.startsWith("templates/")) return LayoutTemplateIcon;
  if (path.startsWith("assets/")) return PackageIcon;
  return FileTextIcon;
}

function PackageTree({
  skill,
  selectedFile,
  onSelect,
}: {
  skill: SkillDetails;
  selectedFile: string;
  onSelect: (path: string) => void;
}) {
  const groups = useMemo(() => {
    const root: SkillFile[] = [];
    const folders = new Map<string, SkillFile[]>();
    for (const file of skill.files) {
      const [first] = file.path.split("/");
      if (!file.path.includes("/")) root.push(file);
      else folders.set(first, [...(folders.get(first) ?? []), file]);
    }
    return { root, folders: [...folders.entries()].sort(([a], [b]) => a.localeCompare(b)) };
  }, [skill.files]);

  const fileButton = (file: SkillFile, nested = false) => {
    const Icon = fileIcon(file.path);
    return (
      <button
        key={file.path}
        type="button"
        onClick={() => onSelect(file.path)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
          nested && "pl-7",
          selectedFile === file.path && "bg-foreground/[0.08] text-foreground",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {nested ? file.path.split("/").slice(1).join("/") : file.path}
        </span>
      </button>
    );
  };

  return (
    <nav aria-label="Arquivos da skill" className="min-h-0 overflow-auto p-2">
      {fileButton({ path: "SKILL.md", size: skill.document.length })}
      {groups.root.map((file) => fileButton(file))}
      {groups.folders.map(([folder, files]) => (
        <div key={folder} className="mt-1">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            <FolderOpenIcon className="size-3.5" /> {folder}
            <span className="ml-auto text-[10px] tabular-nums">{files.length}</span>
          </div>
          {files.map((file) => fileButton(file, true))}
        </div>
      ))}
    </nav>
  );
}

function CodePreview({
  path,
  content,
  loading,
  error,
  truncated,
}: {
  path: string;
  content: string;
  loading: boolean;
  error: string;
  truncated: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (loading)
    return (
      <div className="p-6">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  if (error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-6 text-center"
        role="alert"
      >
        <AlertCircleIcon className="size-5 text-destructive" />
        <p className="mt-3 text-sm font-medium">Não foi possível abrir o arquivo</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-foreground/8 px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{path}</span>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          title="Copiar conteúdo"
          aria-label={`Copiar ${path}`}
          onClick={() => {
            void navigator.clipboard.writeText(content);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <CheckCircle2Icon className="text-emerald-500" /> : <CopyIcon />}
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto bg-black/15 py-3 font-mono text-[12px] leading-5 text-foreground/85">
        {content.split("\n").map((line, index) => (
          <span
            key={`${index}-${line.slice(0, 8)}`}
            className="grid min-w-max grid-cols-[3.25rem_1fr] px-3"
          >
            <span className="select-none pr-4 text-right text-muted-foreground/45">
              {index + 1}
            </span>
            <span
              className={cn(
                path === "SKILL.md" && line.startsWith("#") && "font-semibold text-sky-300",
              )}
            >
              {line || " "}
            </span>
          </span>
        ))}
      </pre>
      {truncated && (
        <p className="shrink-0 border-t border-foreground/8 px-3 py-2 text-[11px] text-amber-500">
          Prévia limitada aos primeiros 300 mil caracteres.
        </p>
      )}
    </div>
  );
}

function DetailsContent({
  skill,
  loading,
  error,
  selectedFile,
  fileContent,
  fileLoading,
  fileError,
  fileTruncated,
  onSelectFile,
  onRetry,
}: {
  skill: SkillDetails | null;
  loading: boolean;
  error: string;
  selectedFile: string;
  fileContent: string;
  fileLoading: boolean;
  fileError: string;
  fileTruncated: boolean;
  onSelectFile: (path: string) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="grid h-full gap-5 p-6">
        <Skeleton className="h-20 w-2/3" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  if (error || !skill) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-8 text-center"
        role={error ? "alert" : undefined}
      >
        <AlertCircleIcon className="size-5 text-destructive" />
        <p className="mt-3 text-sm font-medium">Não foi possível abrir esta skill</p>
        <p className="mt-1 text-xs text-muted-foreground">{error || "Skill não encontrada."}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RotateCwIcon /> Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-foreground/8 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-foreground/8 bg-foreground/[0.04]">
            <PuzzleIcon className="size-5 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-[-0.025em]">
              {skill.displayName || skill.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {skill.user ? "Adicionada por você" : "Nativa da Nullain"} · {skill.name}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground/80">
              {skill.description}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="rounded-md border border-foreground/10 px-2 py-1 text-[10px] text-muted-foreground">
            Agent Skills
          </span>
          <span className="rounded-md border border-foreground/10 px-2 py-1 text-[10px] text-muted-foreground">
            {skill.files.length} recurso(s)
          </span>
          {skill.resourceKinds?.map((kind) => (
            <span
              key={kind}
              className="rounded-md border border-foreground/10 px-2 py-1 text-[10px] text-muted-foreground"
            >
              {kind}
            </span>
          ))}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="max-h-40 border-b border-foreground/8 bg-foreground/[0.015] sm:max-h-none sm:border-b-0 sm:border-r">
          <PackageTree skill={skill} selectedFile={selectedFile} onSelect={onSelectFile} />
        </aside>
        <CodePreview
          path={selectedFile}
          content={fileContent}
          loading={fileLoading}
          error={fileError}
          truncated={fileTruncated}
        />
      </div>
    </div>
  );
}

export function SkillsLibrary() {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [details, setDetails] = useState<SkillDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [selectedFile, setSelectedFile] = useState("SKILL.md");
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileTruncated, setFileTruncated] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const notify = useCallback((tone: Notice["tone"], message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ id: Date.now(), tone, message });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4200);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const loadSkillsList = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/skills");
      const payload = (await response.json().catch(() => ({}))) as {
        skills?: SkillInfo[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar as skills.");
      const loaded = payload.skills ?? [];
      setSkills(loaded);
      setDisabled(applySkillCatalogDefaults(loaded));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as skills.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDisabled(loadDisabledSkills());
    void loadSkillsList();
  }, [loadSkillsList]);

  const openDetails = useCallback(async (name: string) => {
    setSelectedName(name);
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    setSelectedFile("SKILL.md");
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(name)}`);
      const payload = (await response.json().catch(() => ({}))) as SkillDetails & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os detalhes.");
      setDetails(payload);
      setFileContent(payload.document);
      setFileError("");
      setFileTruncated(false);
    } catch (error) {
      setDetailsError(
        error instanceof Error ? error.message : "Não foi possível carregar os detalhes.",
      );
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (!selectedName || !details) return;
      setSelectedFile(path);
      setFileError("");
      if (path === "SKILL.md") {
        setFileContent(details.document);
        setFileTruncated(false);
        return;
      }
      setFileLoading(true);
      try {
        const response = await fetch(
          `/api/skills/${encodeURIComponent(selectedName)}/files?path=${encodeURIComponent(path)}`,
        );
        const payload = (await response.json().catch(() => ({}))) as {
          content?: string;
          truncated?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível abrir o arquivo.");
        setFileContent(payload.content ?? "");
        setFileTruncated(Boolean(payload.truncated));
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
      } finally {
        setFileLoading(false);
      }
    },
    [details, selectedName],
  );

  const toggleSkill = (name: string, enabled: boolean) => {
    const next = enabled
      ? disabled.filter((item) => item !== name)
      : [...new Set([...disabled, name])];
    setDisabled(next);
    saveDisabledSkills(next);
    notify("success", `${name} ${enabled ? "está disponível" : "foi removida"} para o agente.`);
  };

  const importSkill = async (file: File) => {
    const validationError = getUploadError(file);
    if (validationError) {
      notify("error", validationError);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/skills", { method: "POST", body: form });
      const payload = (await response.json().catch(() => ({}))) as {
        name?: string;
        skillName?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ??
            (response.status === 409
              ? "Já existe uma skill com este identificador."
              : "Falha ao importar a skill."),
        );
      }
      if (payload.name || payload.skillName)
        markNewSkillDisabled(payload.name ?? payload.skillName!);
      await loadSkillsList();
      notify(
        "success",
        `Skill ${payload.name ?? payload.skillName ?? file.name} importada com sucesso.`,
      );
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao importar a skill.");
    } finally {
      setUploading(false);
    }
  };

  const deleteSkill = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(deleteTarget.name)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível excluir a skill.");
      setSkills((current) => current.filter((skill) => skill.name !== deleteTarget.name));
      setDisabled((current) => current.filter((name) => name !== deleteTarget.name));
      forgetSkillPreference(deleteTarget.name);
      if (selectedName === deleteTarget.name) {
        setSelectedName(null);
        setDetails(null);
      }
      notify("success", `Skill ${deleteTarget.name} excluída.`);
      setDeleteTarget(null);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível excluir a skill.");
    } finally {
      setDeleting(false);
    }
  };

  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesQuery =
        !normalized ||
        `${skill.displayName} ${skill.name} ${skill.description}`
          .toLowerCase()
          .includes(normalized);
      const kinds = skill.resourceKinds ?? [];
      const matchesFilter =
        filter === "all" ||
        (filter === "native" && skill.native) ||
        (filter === "user" && skill.user) ||
        (filter === "scripts" && kinds.includes("scripts")) ||
        (filter === "templates" && kinds.includes("templates"));
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, skills]);

  const closeDetails = () => {
    setSelectedName(null);
    setDetails(null);
    setFileError("");
  };
  const detailsContent = (
    <DetailsContent
      skill={details}
      loading={detailsLoading}
      error={detailsError}
      selectedFile={selectedFile}
      fileContent={fileContent}
      fileLoading={fileLoading}
      fileError={fileError}
      fileTruncated={fileTruncated}
      onSelectFile={(path) => void openFile(path)}
      onRetry={() => selectedName && void openDetails(selectedName)}
    />
  );

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-20 border-b border-foreground/8 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[82rem] items-end justify-between gap-5 px-5 py-6 sm:px-7 lg:px-10 lg:py-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Biblioteca da Nullain
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
              Skills
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Procedimentos, scripts, referências e templates reutilizáveis.
            </p>
          </div>
          <Button
            className="h-10 rounded-xl px-3.5"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
            <span className="hidden sm:inline">{uploading ? "Importando" : "Importar pacote"}</span>
            <span className="sm:hidden">Importar</span>
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".md,.markdown,.zip"
            className="sr-only"
            aria-label="Selecionar pacote de skill"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importSkill(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[82rem] px-5 py-6 sm:px-7 lg:px-10 lg:py-8">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar skills"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ["all", "Todas"],
              ["native", "Nativas"],
              ["user", "Minhas"],
              ["scripts", "Com scripts"],
              ["templates", "Com templates"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "secondary" : "ghost"}
              className="shrink-0 rounded-full"
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
          {!loading && (
            <span className="ml-auto self-center px-2 text-xs tabular-nums text-muted-foreground">
              {filteredSkills.length} skill(s)
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ativação passa a valer no próximo envio e fica salva neste navegador.
        </p>

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : loadError ? (
          <div
            className="mt-6 rounded-2xl border border-dashed border-destructive/30 px-6 py-12 text-center"
            role="alert"
          >
            <AlertCircleIcon className="mx-auto size-5 text-destructive" />
            <h2 className="mt-3 text-sm font-semibold">Não foi possível carregar as skills</h2>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" className="mt-4" onClick={() => void loadSkillsList()}>
              <RotateCwIcon /> Tentar novamente
            </Button>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-foreground/15 px-6 py-14 text-center">
            <FileArchiveIcon className="mx-auto size-5 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold">Nenhuma skill encontrada</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ajuste a busca ou importe um pacote Agent Skills.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSkills.map((skill, index) => {
              const enabled = !disabled.includes(skill.name);
              const kinds = skill.resourceKinds ?? [];
              return (
                <article
                  key={skill.name}
                  className="group overflow-hidden rounded-2xl border border-foreground/10 bg-card transition-colors hover:border-foreground/20"
                >
                  <button
                    type="button"
                    onClick={() => void openDetails(skill.name)}
                    className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div
                      className={cn(
                        "relative flex h-28 items-center justify-center overflow-hidden border-b border-foreground/8",
                        index % 3 === 0
                          ? "bg-amber-500/[0.07]"
                          : index % 3 === 1
                            ? "bg-sky-500/[0.07]"
                            : "bg-violet-500/[0.07]",
                      )}
                    >
                      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:18px_18px]" />
                      <span className="relative flex size-14 items-center justify-center rounded-2xl border border-foreground/10 bg-background/70 shadow-sm">
                        <PuzzleIcon className="size-6 text-muted-foreground" />
                      </span>
                      <span className="absolute right-3 top-3 rounded-full border border-foreground/10 bg-background/75 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
                        {skill.user ? "Sua" : "Nullain"}
                      </span>
                    </div>
                    <div className="p-4">
                      <h2 className="truncate text-sm font-semibold">
                        {skill.displayName || skill.name}
                      </h2>
                      <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                        {skill.summary || skill.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {kinds.slice(0, 3).map((kind) => (
                          <span
                            key={kind}
                            className="rounded-md border border-foreground/8 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {kind}
                          </span>
                        ))}
                        {!kinds.length && (
                          <span className="rounded-md border border-foreground/8 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            SKILL.md
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between border-t border-foreground/8 px-4 py-3">
                    <span className="text-[11px] text-muted-foreground">
                      {skill.resourceCount ?? 0} recurso(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <SkillSwitch
                        checked={enabled}
                        name={skill.name}
                        onCheckedChange={(checked) => toggleSkill(skill.name, checked)}
                      />
                      <Popover>
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ações para ${skill.name}`}
                            />
                          }
                        >
                          <MoreHorizontalIcon />
                        </PopoverTrigger>
                        <PopoverContent align="end" side="bottom" className="w-44 gap-1 p-1.5">
                          <button
                            type="button"
                            onClick={() => void openDetails(skill.name)}
                            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-foreground/5"
                          >
                            <FileCode2Icon className="size-3.5" /> Ver pacote
                          </button>
                          {skill.user && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(skill)}
                              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Trash2Icon className="size-3.5" /> Excluir skill
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {!isMobile && (
        <Dialog
          open={selectedName !== null}
          onOpenChange={(open) => {
            if (!open) closeDetails();
          }}
        >
          <DialogContent className="h-[min(48rem,calc(100svh-2rem))] overflow-hidden p-0 sm:max-w-[min(72rem,calc(100vw-2rem))]">
            <DialogHeader className="sr-only">
              <DialogTitle>Pacote da skill</DialogTitle>
              <DialogDescription>Arquivos e instruções da skill selecionada.</DialogDescription>
            </DialogHeader>
            {detailsContent}
          </DialogContent>
        </Dialog>
      )}
      {isMobile && (
        <Sheet
          open={selectedName !== null}
          onOpenChange={(open) => {
            if (!open) closeDetails();
          }}
        >
          <SheetContent side="right" className="w-[96%] max-w-none gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Pacote da skill</SheetTitle>
              <SheetDescription>Arquivos e instruções da skill selecionada.</SheetDescription>
            </SheetHeader>
            {detailsContent}
          </SheetContent>
        </Sheet>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Esta ação remove a skill e todos os scripts, templates, referências e assets
              adicionados por você. Ela não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={deleting} />}>
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteSkill()}
              disabled={deleting}
            >
              {deleting ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}{" "}
              {deleting ? "Excluindo" : "Excluir skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {notice && (
        <div
          key={notice.id}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-[70] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border bg-popover px-4 py-3 text-sm shadow-lg",
            notice.tone === "error"
              ? "border-destructive/30 text-destructive"
              : "border-emerald-500/25 text-foreground",
          )}
        >
          {notice.tone === "error" ? (
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          )}
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  );
}
