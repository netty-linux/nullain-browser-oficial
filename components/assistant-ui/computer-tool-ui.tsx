"use client";

import { useEffect, useRef } from "react";
import { useAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { ComputerView } from "./computer-view";

/**
 * Tool UI inline do computador (Inversão FASE 5).
 *
 * As `openbot_computer_*` são CLIENT TOOLS do Mastra: o servidor as declara ao
 * modelo e emite a tool-call, mas NÃO as executa. Este componente executa
 * navegação, snapshot, leitura e ações no browser pelo proxy local
 * `/api/computers/<id>/*` e devolve o resultado ao modelo via `addResult`.
 * A navegação também renderiza o ComputerView inline.
 *
 * O computerId é o do coworker Nullain (OPENBOT_AGENT_ID): o computador por-bot
 * é um container isolado e esse id é também o id da máquina no OpenBot.
 */
const COMPUTER_ID =
  process.env.NEXT_PUBLIC_OPENBOT_AGENT_ID ?? "agent_3fb48f96-c51c-448d-adc9-5fdd3b9448ed";

/** Executa a navegação no browser e devolve o resultado ao modelo. */
function NavigateExecutor({
  args,
  addResult,
  toolCallId,
  result,
}: {
  args?: { url?: string };
  addResult: (result: unknown) => void;
  toolCallId?: string;
  result?: unknown;
}) {
  const ran = useRef(false);
  const url = args?.url;

  // Executa a navegação UMA vez por tool call (quando ainda não há resultado).
  useEffect(() => {
    if (ran.current || result !== undefined || !url) return;
    ran.current = true;
    void (async () => {
      const body: Record<string, unknown> = { url };
      if (toolCallId) body.toolCallId = toolCallId;
      try {
        const res = await fetch(`/api/computers/${COMPUTER_ID}/navigate`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          addResult({
            ok: false,
            reason: (parsed.error as string) ?? "The navigation did not work.",
          });
          return;
        }
        addResult({
          ok: true,
          url: parsed.url,
          title: parsed.title,
          text: parsed.text,
          truncated: parsed.truncated,
        });
      } catch {
        addResult({ ok: false, reason: "The assistant's computer could not be reached." });
      }
    })();
  }, [url, addResult, toolCallId, result]);

  return null;
}

type ComputerToolArgs = Record<string, unknown>;

function ComputerCommandExecutor({
  endpoint,
  method = "POST",
  args,
  addResult,
  result,
}: {
  endpoint: "snapshot" | "read" | "click" | "type" | "key" | "scroll";
  method?: "GET" | "POST";
  args?: ComputerToolArgs;
  addResult: (result: unknown) => void;
  result?: unknown;
}) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || result !== undefined) return;
    ran.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/computers/${COMPUTER_ID}/${endpoint}`, {
          method,
          credentials: "include",
          ...(method === "POST"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(args ?? {}),
              }
            : {}),
        });
        const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          addResult({
            ok: false,
            reason: (parsed.error as string) ?? `The computer action ${endpoint} did not work.`,
            ...(typeof parsed.rule === "string" ? { rule: parsed.rule } : {}),
          });
          return;
        }
        addResult({ ok: true, ...parsed });
      } catch {
        addResult({ ok: false, reason: "The assistant's computer could not be reached." });
      }
    })();
  }, [endpoint, method, args, addResult, result]);

  return null;
}

export function ComputerToolUI() {
  useAssistantToolUI({
    toolName: "openbot_computer_navigate",
    render: (props) => <ComputerNavigateRenderer {...props} />,
    // A tela do computador É o resultado visível: renderiza inline na
    // mensagem, fora do bloco de atividade colapsável (ActivityBlock).
    display: "standalone",
  });

  useAssistantToolUI({
    toolName: "openbot_computer_snapshot",
    render: ({ args, addResult, result }) => (
      <ComputerCommandExecutor
        endpoint="snapshot"
        args={args as ComputerToolArgs}
        addResult={addResult}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_read",
    render: ({ args, addResult, result }) => (
      <ComputerCommandExecutor
        endpoint="read"
        method="GET"
        args={args as ComputerToolArgs}
        addResult={addResult}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_click",
    render: ({ args, addResult, result }) => (
      <ComputerCommandExecutor
        endpoint="click"
        args={args as ComputerToolArgs}
        addResult={addResult}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_type",
    render: ({ args, addResult, result }) => (
      <ComputerCommandExecutor
        endpoint="type"
        args={args as ComputerToolArgs}
        addResult={addResult}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_key",
    render: ({ args, addResult, result }) => (
      <ComputerCommandExecutor
        endpoint="key"
        args={args as ComputerToolArgs}
        addResult={addResult}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_scroll",
    render: ({ args, addResult, result }) => (
      <ComputerCommandExecutor
        endpoint="scroll"
        args={args as ComputerToolArgs}
        addResult={addResult}
        result={result}
      />
    ),
  });

  // Sem conteúdo próprio — apenas registra a tool UI acima enquanto montado.
  return null;
}

function ComputerNavigateRenderer({
  toolCallId,
  args,
  result,
  addResult,
}: ToolCallMessagePartProps<{ url?: string }, unknown>) {
  const finished = result !== undefined;
  let page;
  try {
    const parsed =
      typeof result === "string"
        ? JSON.parse(result)
        : (result as Record<string, unknown> | undefined);
    if (parsed && typeof parsed.url === "string") {
      page = {
        url: parsed.url,
        ...(typeof parsed.title === "string" ? { title: parsed.title } : {}),
      };
    }
  } catch {
    // Result não-JSON: só mostrar a tela ao vivo, sem página lembrada.
  }

  // Turno encerrado sem página conhecida (frame recusado, erro de rede,
  // result sem url): um tile grande de "did not open a page" é ruído — o
  // texto da resposta já conta o que aconteceu. Renderiza nada.
  if (finished && !page) return null;

  return (
    <div className="my-2">
      <NavigateExecutor args={args} addResult={addResult} toolCallId={toolCallId} result={result} />
      <ComputerView
        computerId={COMPUTER_ID}
        active={!finished}
        finished={finished}
        {...(page ? { page } : {})}
        {...(toolCallId ? { toolCallId } : {})}
      />
    </div>
  );
}
