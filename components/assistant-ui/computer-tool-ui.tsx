"use client";

import { useEffect, useRef, useState } from "react";
import { useAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { ComputerView } from "./computer-view";
import { useBotComputerTarget } from "@/components/bots/use-bot-computer";
import { computerUrl } from "@/lib/computers/client";

const EXECUTED_TOOL_CALLS = new Set<string>();
const MAX_EXECUTED_TOOL_CALLS = 500;
const LATEST_LOCAL_NAVIGATION = new Map<string, string>();
const LOCAL_NAVIGATION_LISTENERS = new Set<() => void>();

function publishLatestLocalNavigation(scope: string, toolCallId: string) {
  if (LATEST_LOCAL_NAVIGATION.get(scope) === toolCallId) return;
  LATEST_LOCAL_NAVIGATION.set(scope, toolCallId);
  for (const listener of LOCAL_NAVIGATION_LISTENERS) listener();
}

function claimToolExecution(toolCallId: string | undefined): boolean {
  if (!toolCallId) return true;
  if (EXECUTED_TOOL_CALLS.has(toolCallId)) return false;
  EXECUTED_TOOL_CALLS.add(toolCallId);
  if (EXECUTED_TOOL_CALLS.size > MAX_EXECUTED_TOOL_CALLS) {
    const oldest = EXECUTED_TOOL_CALLS.values().next().value;
    if (oldest) EXECUTED_TOOL_CALLS.delete(oldest);
  }
  return true;
}

function finishToolExecution(toolCallId: string | undefined) {
  if (toolCallId) EXECUTED_TOOL_CALLS.add(toolCallId);
}

function releaseToolExecution(toolCallId: string | undefined) {
  if (toolCallId) EXECUTED_TOOL_CALLS.delete(toolCallId);
}

/**
 * Tool UI inline do computador (Inversão FASE 5).
 *
 * As `openbot_computer_*` são CLIENT TOOLS do Mastra: o servidor as declara ao
 * modelo e emite a tool-call, mas NÃO as executa. Este componente executa
 * navegação, snapshot, leitura e ações no browser pelo proxy local do
 * computador e devolve o resultado ao modelo via `addResult`. A navegação
 * também renderiza o ComputerView inline.
 *
 * Stage 3A: o target (id + proxy) é resolvido pelo bot ativo — bot não-system
 * com vínculo usa `/api/bots/:botId/computer`, cujo servidor resolve o agente a
 * partir do vínculo (o browser nunca é autoridade). System bot e sem vínculo
 * preservam o computador legado da Nullain.
 */

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
  const { ready, target } = useBotComputerTarget();
  const url = args?.url;

  // Executa a navegação UMA vez por tool call (quando ainda não há resultado
  // e o target do computador já foi resolvido).
  useEffect(() => {
    if (ran.current || result !== undefined || !url || !ready) return;
    if (!claimToolExecution(toolCallId)) return;
    ran.current = true;
    const controller = new AbortController();
    let settled = false;
    void (async () => {
      const body: Record<string, unknown> = { url };
      if (toolCallId) body.toolCallId = toolCallId;
      try {
        const res = await fetch(computerUrl(target.computerId, "/navigate", target.basePath), {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (controller.signal.aborted) return;
        settled = true;
        finishToolExecution(toolCallId);
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
        if (controller.signal.aborted) return;
        settled = true;
        finishToolExecution(toolCallId);
        addResult({ ok: false, reason: "The assistant's computer could not be reached." });
      }
    })();
    return () => {
      controller.abort();
      if (!settled) releaseToolExecution(toolCallId);
    };
  }, [url, addResult, toolCallId, result, ready, target]);

  return null;
}

type ComputerToolArgs = Record<string, unknown>;

function ComputerCommandExecutor({
  endpoint,
  method = "POST",
  args,
  addResult,
  toolCallId,
  result,
}: {
  endpoint: "snapshot" | "read" | "click" | "type" | "key" | "scroll";
  method?: "GET" | "POST";
  args?: ComputerToolArgs;
  addResult: (result: unknown) => void;
  toolCallId?: string;
  result?: unknown;
}) {
  const ran = useRef(false);
  const { ready, target } = useBotComputerTarget();

  useEffect(() => {
    if (ran.current || result !== undefined || !ready) return;
    if (!claimToolExecution(toolCallId)) return;
    ran.current = true;
    const controller = new AbortController();
    let settled = false;
    void (async () => {
      try {
        const res = await fetch(computerUrl(target.computerId, `/${endpoint}`, target.basePath), {
          method,
          credentials: "include",
          signal: controller.signal,
          ...(method === "POST"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(args ?? {}),
              }
            : {}),
        });
        const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (controller.signal.aborted) return;
        settled = true;
        finishToolExecution(toolCallId);
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
        if (controller.signal.aborted) return;
        settled = true;
        finishToolExecution(toolCallId);
        addResult({ ok: false, reason: "The assistant's computer could not be reached." });
      }
    })();
    return () => {
      controller.abort();
      if (!settled) releaseToolExecution(toolCallId);
    };
  }, [endpoint, method, args, addResult, toolCallId, result, ready, target]);

  return null;
}

export function ComputerToolUI() {
  useAssistantToolUI({
    toolName: "nullain_computer_navigate",
    render: (props) => <LocalComputerNavigateRenderer {...props} />,
    display: "standalone",
  });

  useAssistantToolUI({
    toolName: "openbot_computer_navigate",
    render: (props) => <ComputerNavigateRenderer {...props} />,
    // A tela do computador É o resultado visível: renderiza inline na
    // mensagem, fora do bloco de atividade colapsável (ActivityBlock).
    display: "standalone",
  });

  useAssistantToolUI({
    toolName: "openbot_computer_snapshot",
    render: ({ args, addResult, toolCallId, result }) => (
      <ComputerCommandExecutor
        endpoint="snapshot"
        args={args as ComputerToolArgs}
        addResult={addResult}
        toolCallId={toolCallId}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_read",
    render: ({ args, addResult, toolCallId, result }) => (
      <ComputerCommandExecutor
        endpoint="read"
        method="GET"
        args={args as ComputerToolArgs}
        addResult={addResult}
        toolCallId={toolCallId}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_click",
    render: ({ args, addResult, toolCallId, result }) => (
      <ComputerCommandExecutor
        endpoint="click"
        args={args as ComputerToolArgs}
        addResult={addResult}
        toolCallId={toolCallId}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_type",
    render: ({ args, addResult, toolCallId, result }) => (
      <ComputerCommandExecutor
        endpoint="type"
        args={args as ComputerToolArgs}
        addResult={addResult}
        toolCallId={toolCallId}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_key",
    render: ({ args, addResult, toolCallId, result }) => (
      <ComputerCommandExecutor
        endpoint="key"
        args={args as ComputerToolArgs}
        addResult={addResult}
        toolCallId={toolCallId}
        result={result}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "openbot_computer_scroll",
    render: ({ args, addResult, toolCallId, result }) => (
      <ComputerCommandExecutor
        endpoint="scroll"
        args={args as ComputerToolArgs}
        addResult={addResult}
        toolCallId={toolCallId}
        result={result}
      />
    ),
  });

  // Sem conteúdo próprio — apenas registra a tool UI acima enquanto montado.
  return null;
}

function resultPage(result: unknown): { url?: string; title?: string } | undefined {
  try {
    const parsed =
      typeof result === "string"
        ? JSON.parse(result)
        : (result as Record<string, unknown> | undefined);
    if (parsed && typeof parsed.url === "string") {
      return {
        url: parsed.url,
        ...(typeof parsed.title === "string" ? { title: parsed.title } : {}),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function LocalComputerNavigateRenderer({
  toolCallId,
  result,
}: ToolCallMessagePartProps<{ url?: string }, unknown>) {
  const { ready, target } = useBotComputerTarget();
  const finished = result !== undefined;
  const page = resultPage(result);
  const pageUrl = page?.url;
  const [, update] = useState(0);
  useEffect(() => {
    const listener = () => update((value) => value + 1);
    LOCAL_NAVIGATION_LISTENERS.add(listener);
    if (finished && pageUrl && toolCallId) {
      publishLatestLocalNavigation(target.basePath, toolCallId);
    }
    return () => {
      LOCAL_NAVIGATION_LISTENERS.delete(listener);
    };
  }, [finished, pageUrl, target.basePath, toolCallId]);
  if (!ready || (finished && !page)) return null;
  if (finished && toolCallId && LATEST_LOCAL_NAVIGATION.get(target.basePath) !== toolCallId) {
    return null;
  }
  return (
    <div className="my-2">
      <ComputerView
        computerId={target.computerId}
        basePath={target.basePath}
        name={target.name}
        active={!finished}
        finished={finished}
        {...(page ? { page } : {})}
        {...(toolCallId ? { toolCallId } : {})}
      />
    </div>
  );
}

function ComputerNavigateRenderer({
  toolCallId,
  args,
  result,
  addResult,
}: ToolCallMessagePartProps<{ url?: string }, unknown>) {
  const { target } = useBotComputerTarget();
  const finished = result !== undefined;
  const page = resultPage(result);

  // Turno encerrado sem página conhecida (frame recusado, erro de rede,
  // result sem url): um tile grande de "did not open a page" é ruído — o
  // texto da resposta já conta o que aconteceu. Renderiza nada.
  if (finished && !page) return null;

  return (
    <div className="my-2">
      <NavigateExecutor args={args} addResult={addResult} toolCallId={toolCallId} result={result} />
      <ComputerView
        computerId={target.computerId}
        basePath={target.basePath}
        name={target.name}
        active={!finished}
        finished={finished}
        {...(page ? { page } : {})}
        {...(toolCallId ? { toolCallId } : {})}
      />
    </div>
  );
}
