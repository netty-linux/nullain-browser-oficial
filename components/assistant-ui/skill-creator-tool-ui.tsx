"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2Icon, LoaderCircleIcon, PuzzleIcon, TriangleAlertIcon } from "lucide-react";
import { useAssistantToolUI, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { markNewSkillDisabled } from "@/lib/chat-model";

const SkillCreatorRenderer: ToolCallMessagePartComponent = ({ result, status, argsText }) => {
  const recorded = useRef(false);
  const output = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  let requestedName = "nova skill";
  try {
    const args = JSON.parse(argsText ?? "{}") as { name?: string };
    if (args.name) requestedName = args.name;
  } catch {}
  const name = typeof output?.name === "string" ? output.name : requestedName;
  const success = output?.ok === true;
  const running = status?.type === "running";

  useEffect(() => {
    if (recorded.current || !success || !name) return;
    recorded.current = true;
    markNewSkillDisabled(name);
  }, [success, name]);

  return (
    <div className="my-2 flex max-w-lg items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.025] px-3.5 py-3 text-sm">
      {running ? (
        <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : success ? (
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : output ? (
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : (
        <PuzzleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <p className="font-medium">
          {running ? "Criando skill…" : success ? `Skill ${name} criada` : `Skill ${name}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {running
            ? "Validando e registrando no catálogo privado."
            : success
              ? "Adicionada ao catálogo e desativada por padrão."
              : typeof output?.error === "string"
                ? output.error
                : "A criação não foi concluída."}
        </p>
      </div>
    </div>
  );
};

export function SkillCreatorToolUI() {
  useAssistantToolUI({
    toolName: "create_skill",
    render: SkillCreatorRenderer,
    display: "standalone",
  });
  return null;
}
