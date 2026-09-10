"use client";

import { type FC } from "react";
import { SparklesIcon } from "lucide-react";
import { useAssistantToolUI, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

/**
 * Chip visual exibido no lugar do tool-call quando o agente carrega uma skill
 * (tool nativa `skill`, legado `load_skill`). Mostra o nome da skill num chip
 * discreto com ícone de sparkles, seguindo o padrão visual do ToolFallback ghost.
 */
const SkillChipRenderer: ToolCallMessagePartComponent = ({ argsText, status }) => {
  let skillName = "";
  try {
    const parsed = JSON.parse(argsText ?? "{}") as {
      name?: string;
      skillName?: string;
      skill?: string;
    };
    skillName = parsed.name ?? parsed.skillName ?? parsed.skill ?? "";
  } catch {
    skillName = "";
  }
  const running = status?.type === "running";

  return (
    <div
      data-slot="aui-skill-chip"
      className="my-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-700 dark:text-violet-300"
    >
      <SparklesIcon className={cn("size-3", running && "animate-pulse")} />
      <span>
        {running ? "carregando skill" : "skill"}: <b>{skillName || "desconhecida"}</b>
      </span>
    </div>
  );
};

/**
 * Registra o renderer para tool-calls de skill (`skill` nativa + legado
 * `load_skill`) enquanto montado. Renderizado uma vez por AssistantMessage.
 */
export const SkillChip: FC = () => {
  useAssistantToolUI({
    toolName: "skill",
    render: SkillChipRenderer,
  });
  useAssistantToolUI({
    toolName: "load_skill",
    render: SkillChipRenderer,
  });
  return null;
};
