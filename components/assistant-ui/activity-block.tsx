"use client";

import { useMemo, type FC } from "react";
import { BrainIcon } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought";

type ActivityEntry = { id: string; text: string };

const TOOL_LABELS: Record<string, string> = {
  COMPOSIO_SEARCH_TOOLS: "Buscou as ferramentas necessárias",
  COMPOSIO_GET_TOOL_SCHEMAS: "Preparou os parâmetros da ação",
  COMPOSIO_MULTI_EXECUTE_TOOL: "Executou a ação solicitada",
  COMPOSIO_MANAGE_CONNECTIONS: "Verificou a conexão do aplicativo",
  COMPOSIO_WAIT_FOR_CONNECTIONS: "Aguardou a autorização da conexão",
  COMPOSIO_REMOTE_WORKBENCH: "Processou os dados coletados",
  COMPOSIO_REMOTE_BASH_TOOL: "Executou o processamento remoto",
  load_skill: "Carregou conhecimento especializado",
  skill: "Carregou conhecimento especializado",
  skill_read: "Leu material de apoio da skill",
  skill_search: "Buscou conhecimento especializado",
  nullain_computer_navigate: "Abriu a página",
  nullain_computer_open_site: "Localizou e abriu o site",
  nullain_computer_snapshot: "Observou a página",
  nullain_computer_read: "Verificou a página",
  nullain_computer_click: "Clicou em um elemento",
  nullain_computer_type: "Preencheu um campo",
  nullain_computer_key: "Pressionou uma tecla",
  nullain_computer_scroll: "Rolou a página",
  nullain_computer_tabs: "Listou as abas",
  nullain_computer_switch_tab: "Trocou de aba",
};

function toolLabel(toolName: string): string {
  const normalized = toolName.replace(/^composio_/i, "");
  // Prefixo legado openbot_ compartilha os rótulos do nullain_.
  const canonical = normalized.replace(/^openbot_/i, "nullain_");
  return (
    TOOL_LABELS[normalized] ??
    TOOL_LABELS[canonical] ??
    normalized
      .replace(/^COMPOSIO_/i, "")
      .replace(/[_-]+/g, " ")
      .toLocaleLowerCase("pt-BR")
      .replace(/^./, (character) => character.toLocaleUpperCase("pt-BR"))
  );
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 240) : "";
}

function useMessageActivity(): ActivityEntry[] {
  const encoded = useAuiState((state) => {
    if (state.message.status?.type === "running") return "[]";
    const parts = state.message.parts ?? [];
    let lastToolIndex = -1;
    for (let index = parts.length - 1; index >= 0; index--) {
      if (parts[index]?.type === "tool-call") {
        lastToolIndex = index;
        break;
      }
    }
    if (lastToolIndex < 0) return "[]";

    const entries: ActivityEntry[] = [];
    const seen = new Set<string>();
    const push = (id: string, text: string) => {
      const normalized = compactText(text);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      entries.push({ id, text: normalized });
    };

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index] as { type?: string; text?: unknown; toolName?: string };
      if (part.type === "text" && index < lastToolIndex) {
        push(`text-${index}`, compactText(part.text));
      } else if (part.type === "tool-call" && part.toolName) {
        push(`tool-${index}`, toolLabel(part.toolName));
      }
    }
    return JSON.stringify(entries);
  });

  return useMemo(() => {
    try {
      return JSON.parse(encoded) as ActivityEntry[];
    } catch {
      return [];
    }
  }, [encoded]);
}

/** Um único bloco agregado para a mensagem inteira. */
export const ActivityBlock: FC = () => {
  const entries = useMessageActivity();
  if (entries.length === 0) return null;

  return (
    <ChainOfThought data-slot="activity-block" className="mb-2 w-full py-1">
      <ChainOfThoughtStep>
        <ChainOfThoughtTrigger
          leftIcon={<BrainIcon className="size-4" />}
          className="w-fit py-1 font-medium"
        >
          Etapas do raciocínio
        </ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          {entries.map((entry) => (
            <ChainOfThoughtItem key={entry.id}>{entry.text}</ChainOfThoughtItem>
          ))}
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  );
};
