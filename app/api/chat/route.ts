import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import { TransformStream as NodeTransformStream } from "node:stream/web";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "@/src/mastra";
import { REASONING_MODELS, ollamaProviderOptions } from "@/src/mastra/models";
import { thinkingExtractor } from "@/src/mastra/transforms/thinking-stream";
import { kernelStreamOptions } from "@/src/mastra/agents/kernel-agent";
import { getSkill } from "@/src/mastra/skills/loader";
import { SKILL_CONTEXT_KEYS } from "@/src/mastra/skills/native-resolver";
import { buildChatInstructions } from "@/lib/server/chat-instructions";
import { buildChatToolsets } from "@/lib/server/chat-toolsets";
import {
  createComputerAwareToolCallRepair,
  repairMalformedToolCall,
} from "@/lib/server/tool-call-repair";
import { updateComputerToolOutcome } from "@/lib/server/computer-tool-outcome";
import { isLocalComputerEnabled } from "@/lib/server/local-computer";
import { sanitizeIntegrationKey } from "@/lib/integration-key";
import {
  CHAT_MODEL_IDS,
  DEFAULT_VISION_CHAT_MODEL,
  isVisionChatModel,
  resolveSelectedModel,
} from "@/lib/model-catalog";
import {
  getLatestUserImageDataUrl,
  hasLatestUserImage,
  pruneMessageHistory,
} from "@/lib/server/chat-message-history";
import { VISION_INPUT_CONTEXT_KEY } from "@/src/mastra/processors/strip-image-parts";
import { getNullainSession } from "@/lib/server/nullain-auth";
import { resolveBotRuntime } from "@/lib/server/bot-runtime-repository";
import {
  appendUserTranscript,
  appendServerTranscript,
  claimTranscriptRun,
  ensureTranscriptRun,
  finishTranscriptRun,
  getTranscriptMessage,
  listBotTranscript,
  resumeTranscriptRun,
  type TranscriptRunCapability,
} from "@/lib/server/bot-transcript-repository";
import { advanceBotInterview } from "@/lib/server/bot-interview";
import {
  completedComputerToolsAfterLastUser,
  selectBotAgentInput,
} from "@/lib/server/bot-agent-input";
import { buildBotTextContext } from "@/lib/server/bot-agent-context";

// Modelos pesados (nemotron-3-ultra, glm-5.1...) podem passar de 30s no
// primeiro token; com 30 a função morria no meio do stream e a resposta
// ficava vazia.
export const maxDuration = 300;

const ALLOWED_MODELS = new Set<string>(CHAT_MODEL_IDS);

// Esforço de raciocínio padrão por modelo, medido no benchmark Nullain
// (D:\Hermes-Windows\hermes-creations\nullain-bench — 15 tarefas verificáveis,
// math/lógica/extração, think on/off). Princípios:
// - gpt-oss e glm-5.2: reasoning melhora acurácia (13/15 vs 12/15 e 13/15 vs
//   11/15) — mantém effort configurável com default "high" para gpt-oss e
//   "high" para glm-5.2 (maior delta de acurácia).
// - deepseek v4 (flash/pro): 13/15 com e sem thinking — reasoning não muda
//   acurácia; default "low" economiza latência sem custo de qualidade.
// - kimi-k3: 13/15 vs 12/15 a favor do thinking — default "medium" (reasoning
//   longo, 1014 chars médios; "high" dobraria latência sem ganho medido).
// - qwen3.5: reasoning MUITO longo (10.795 chars médios, 33.8s de latência) —
//   default "low" para não travar o chat; usuário pode subir no seletor.
// - glm-5.3-flash: 12/15 com thinking vs 13/15 sem, reasoning curto — default
//   "low" (barato e não prejudica).
// - glm-5.1: lento de qualquer forma (9.7-21.7s) — default "low".
// - nemotron: sem dados no benchmark — default "medium" conservador.
// Modelos sem entrada usam "medium" (comportamento anterior).
const DEFAULT_EFFORT_BY_MODEL: Record<string, "low" | "medium" | "high"> = {
  "ollama-cloud/gpt-oss:20b": "high",
  "ollama-cloud/gpt-oss:120b": "high",
  "ollama-cloud/deepseek-v4-flash:0731": "low",
  "ollama-cloud/deepseek-v4-pro": "low",
  "ollama-cloud/kimi-k3": "medium",
  "ollama-cloud/kimi-k2.7-code": "medium",
  "ollama-cloud/kimi-k2.6": "medium",
  // glm-5.3: novo, sem benchmark ainda — "medium" conservador (fallback).
  "ollama-cloud/glm-5.3": "medium",
  "ollama-cloud/glm-5.2": "high",
  "ollama-cloud/glm-5.1": "low",
  "ollama-cloud/glm-5.3-flash": "low",
  "ollama-cloud/qwen3.5:397b": "low",
  "ollama-cloud/nemotron-3-ultra": "medium",
  "ollama-cloud/nemotron-3-nano:30b": "medium",
};

// Effort com Web Search ativo, medido no tool-use bench (4 tarefas × 10 modelos
// × 3 efforts — D:\Hermes-Windows\hermes-creations\nullain-tooluse-report.json).
// Critério: empty%=0 obrigatório (modelo tem que SEMPRE responder após as tool
// calls); entre os válidos, maior taxa de citações, depois menos steps e menor
// latência. Modelos sem entrada usam o DEFAULT_EFFORT_BY_MODEL.
// Nota: kimi-k3 tem 50% de empty mesmo em low/high — se usado, "medium".
const WEB_EFFORT_BY_MODEL: Record<string, "low" | "medium" | "high"> = {
  "ollama-cloud/gpt-oss:20b": "low",
  "ollama-cloud/gpt-oss:120b": "medium",
  "ollama-cloud/deepseek-v4-flash:0731": "medium",
  "ollama-cloud/deepseek-v4-pro": "medium",
  "ollama-cloud/kimi-k3": "medium",
  "ollama-cloud/kimi-k2.7-code": "high",
  "ollama-cloud/glm-5.2": "high",
  "ollama-cloud/glm-5.1": "medium",
  "ollama-cloud/glm-5.3-flash": "low",
  "ollama-cloud/qwen3.5:397b": "medium",
  "ollama-cloud/minimax-m3": "medium",
};

function normalizeModel(input?: string): string | undefined {
  if (!input) return undefined;
  const aliasMap: Record<string, string> = {
    "deepseek-v4-flash:0731-cloud": "ollama-cloud/deepseek-v4-flash:0731",
    "deepseek-v4-pro:0813-cloud": "ollama-cloud/deepseek-v4-pro",
    "deepseek-v4-pro:0813": "ollama-cloud/deepseek-v4-pro",
    "ollama-cloud/deepseek-v4-pro:0813": "ollama-cloud/deepseek-v4-pro",
    "kimi-k3:cloud": "ollama-cloud/kimi-k3",
    "kimi-k2.7-code:cloud": "ollama-cloud/kimi-k2.7-code",
    "kimi-k2.6:cloud": "ollama-cloud/kimi-k2.6",
    "glm-5.3:cloud": "ollama-cloud/glm-5.3",
    "glm-5.2:cloud": "ollama-cloud/glm-5.2",
    "glm-5.1:cloud": "ollama-cloud/glm-5.1",
    "glm-5.3-flash:cloud": "ollama-cloud/glm-5.3-flash",
    "qwen3.5:cloud": "ollama-cloud/qwen3.5:397b",
    "qwen3.5": "ollama-cloud/qwen3.5:397b",
    "ollama-cloud/qwen3.5": "ollama-cloud/qwen3.5:397b",
    "gemma4:cloud": "ollama-cloud/gemma4:31b",
    gemma4: "ollama-cloud/gemma4:31b",
    "ollama-cloud/gemma4": "ollama-cloud/gemma4:31b",
    "minimax-m3:cloud": "ollama-cloud/minimax-m3",
    "minimax-m2.7:cloud": "ollama-cloud/minimax-m2.7",
    "nemotron-3-ultra:cloud": "ollama-cloud/nemotron-3-ultra",
    "nemotron-3-nano:30b-cloud": "ollama-cloud/nemotron-3-nano:30b",
    "mistral-large-3:675b-cloud": "ollama-cloud/mistral-large-3:675b",
    "gpt-oss:20b": "ollama-cloud/gpt-oss:20b",
  };
  if (ALLOWED_MODELS.has(input)) return input;
  if (aliasMap[input]) return aliasMap[input];
  return undefined;
}

// Extrai uma mensagem limpa (sem stack) de erros que chegam serializados
// do Mastra/AI SDK — ex.: {"message":"model \"x\" not found","name":"AI_APICallError",...}
function errorToText(error: unknown): string {
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "message" in parsed &&
        typeof (parsed as { message: unknown }).message === "string"
      ) {
        return (parsed as { message: string }).message;
      }
    } catch {
      // não é JSON — devolve a string como está
    }
    return error;
  }
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Não foi possível gerar a resposta.";
}

// providerOptions para a Ollama Cloud via @ai-sdk/openai-compatible.
// Verificado no código do provider (v3.0.37): apenas `reasoningEffort` é
// reconhecido e convertido em `reasoning_effort` no request; chaves extras
// (think, enableThinking, chat_template_kwargs...) são espalhadas no body sem
// efeito — removidas para não poluir o payload.
// Limite defensivo de payload (16 MB). O histórico viaja completo a cada envio
// com imagens em data URL base64 — se crescer além disso, é sintoma de bug e a
// leitura vai falhar de qualquer forma; devolvemos 400 com mensagem clara em
// vez do 500 opaco "failed to read request body" do Next.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Log de observabilidade da poda (prova no console do dev server). */
function logPruneStats(
  before: unknown[],
  after: unknown[],
  droppedImageParts: number,
  droppedEmptyAssistant: number,
) {
  if (droppedImageParts === 0 && droppedEmptyAssistant === 0) return;
  const bytes = (arr: unknown[]) => Buffer.byteLength(JSON.stringify(arr) ?? "", "utf8");
  const beforeKB = Math.round(bytes(before) / 1024);
  const afterKB = Math.round(bytes(after) / 1024);
  console.info(
    `[/api/chat] histórico podado: imagens antigas removidas=${droppedImageParts}, assistentes vazias removidas=${droppedEmptyAssistant}, payload ~${beforeKB}KB -> ~${afterKB}KB`,
  );
}

function latestUserText(messages: unknown[]): string {
  const message = [...messages]
    .reverse()
    .find(
      (item) => item && typeof item === "object" && (item as { role?: unknown }).role === "user",
    ) as { parts?: unknown[] } | undefined;
  return (message?.parts ?? [])
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
      ),
    )
    .map((part) => part.text)
    .join("\n");
}

function selectedSkillId(messages: unknown[]): string | null {
  const message = [...messages]
    .reverse()
    .find(
      (item) => item && typeof item === "object" && (item as { role?: unknown }).role === "user",
    ) as { metadata?: unknown } | undefined;
  const metadata = message?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const custom = (metadata as { custom?: unknown }).custom;
  if (!custom || typeof custom !== "object") return null;
  const selected = (custom as { selectedSkill?: unknown }).selectedSkill;
  if (!selected || typeof selected !== "object") return null;
  const id = (selected as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function explicitlyRequestsSkillCreation(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    /\b(cri(e|ar|a)|mont(e|ar)|registre|adicione|transforme|build|create|make|register)\b/.test(
      normalized,
    ) && /\b(skill|skills|habilidade|procedimento reutilizavel)\b/.test(normalized)
  );
}

export async function POST(req: Request) {
  // A leitura do body FORA de try/catch gerava o 500 opaco com "(ref: uuid)"
  // do Next 16 quando o payload estourava (histórico reenviando imagens em
  // base64). Agora: log do tamanho + 400 com mensagem que a UI renderiza.
  let body: {
    messages?: unknown[];
    model?: string;
    config?: { modelName?: string; reasoningEffort?: string };
    computer?: boolean;
    integrations?: boolean;
    generation?: boolean;
    generationMode?: "image" | "video";
    disabledSkills?: string[];
    botId?: string;
    botConversationId?: string;
  };
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload muito grande (máx. 16 MB)." }, { status: 413 });
  }
  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload muito grande (máx. 16 MB)." }, { status: 413 });
    }
    body = JSON.parse(rawBody) as typeof body;
  } catch (error) {
    console.error(
      `[/api/chat] failed to read request body (content-length=${contentLength}, cap=${MAX_BODY_BYTES}):`,
      error,
    );
    return Response.json(
      {
        error:
          contentLength > MAX_BODY_BYTES
            ? `Payload muito grande (${Math.round(contentLength / 1024 / 1024)} MB). O histórico com imagens antigas em base64 cresce a cada envio — inicie uma nova conversa ou reenvie sem imagens antigas.`
            : "Corpo da requisição inválido (JSON malformado).",
      },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return Response.json({ error: "O campo messages deve ser um array." }, { status: 400 });
  }
  if (body.messages.length > 200) {
    return Response.json({ error: "Histórico muito longo (máx. 200 mensagens)." }, { status: 400 });
  }
  const {
    messages,
    model: rawModel,
    config,
    computer,
    integrations,
    generation,
    generationMode,
    disabledSkills,
  } = body;

  // Thread ID estável por conversa. Sem header válido, usa um UUID efêmero
  // para nunca compartilhar a memória padrão entre clientes. Uma
  // preferência gravada sobrevive ao restart na mesma thread).
  const headerThreadId = req.headers.get("x-thread-id");
  const requestThreadId =
    headerThreadId && /^[a-zA-Z0-9_-]{1,64}$/.test(headerThreadId)
      ? headerThreadId
      : crypto.randomUUID();

  const raw = config?.modelName ?? rawModel;
  const normalized = normalizeModel(raw);
  if (raw && !normalized) {
    return Response.json({ error: "Modelo não permitido." }, { status: 400 });
  }
  const currentMessages = Array.isArray(messages) ? messages : [];
  const completedComputerTools = completedComputerToolsAfterLastUser(currentMessages);
  const session = await getNullainSession(req.headers).catch(() => null);
  const ownerId = session?.user.id;
  let botRuntime: ReturnType<typeof resolveBotRuntime> | null = null;
  if (body.botId !== undefined) {
    if (!ownerId)
      return Response.json({ error: "Entre para usar um bot persistente." }, { status: 401 });
    try {
      botRuntime = resolveBotRuntime(ownerId, body.botId, body.botConversationId);
    } catch (error) {
      if (error instanceof Response) return error;
      return Response.json(
        { error: error instanceof Error ? error.message : "Bot inválido." },
        { status: 400 },
      );
    }
  }
  const grantedSkills = botRuntime?.grantedSkillNames ?? null;
  const grantedSkillSet = grantedSkills
    ? new Set(grantedSkills.map((name) => name.toLowerCase()))
    : null;
  const disabled = Array.isArray(disabledSkills)
    ? disabledSkills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const explicitSkillId = selectedSkillId(currentMessages);
  const selectedSkill = explicitSkillId ? getSkill(explicitSkillId, [], ownerId) : undefined;
  if (selectedSkill && grantedSkillSet && !grantedSkillSet.has(selectedSkill.name.toLowerCase())) {
    return Response.json(
      { error: "Esta skill não está disponível para o bot atual." },
      { status: 403 },
    );
  }
  if (explicitSkillId && !selectedSkill) {
    return Response.json(
      {
        error:
          "A skill selecionada não está mais disponível para esta conta. Seu texto foi preservado.",
      },
      { status: 409 },
    );
  }
  if (
    selectedSkill &&
    disabled.some((name) => name.toLowerCase() === selectedSkill.name.toLowerCase())
  ) {
    return Response.json(
      { error: "Ative a skill selecionada antes de enviar. Seu texto foi preservado." },
      { status: 409 },
    );
  }
  const hasCurrentImage = hasLatestUserImage(currentMessages);
  // Precedência de modelo (regra de produto):
  // - Computador ON → GPT-OSS 20B sempre (resolveSelectedModel força).
  // - Computador OFF → a seleção do composer vence; modelId do bot (com
  //   migração de aliases legados) e env são fallbacks sem seleção explícita.
  // Antes, o modelId do bot vencia SEMPRE — por isso o billing só mostrava
  // gpt-oss:20b mesmo com outro modelo selecionado.
  // modelId de bot persistido pode usar IDs legados (renomeados no registry) —
  // normaliza antes de usar, igual ao modelo do request.
  const botModel = normalizeModel(botRuntime?.bot.modelId) ?? botRuntime?.bot.modelId;
  const requestedModel =
    normalized ?? botModel ?? process.env.MASTRA_MODEL ?? "ollama-cloud/gpt-oss:20b";
  let selectedModel = resolveSelectedModel({ requestedModel, computer: Boolean(computer) });
  if (hasCurrentImage && !isVisionChatModel(selectedModel)) {
    selectedModel = DEFAULT_VISION_CHAT_MODEL;
  }
  const requestedEffort = config?.reasoningEffort;
  const reasoningEffort =
    requestedEffort === "low" || requestedEffort === "medium" || requestedEffort === "high"
      ? requestedEffort
      : undefined;

  // Preserva somente a imagem do turno atual quando o modelo é multimodal;
  // imagens antigas continuam podadas para o payload não crescer sem limite.
  const pruneResult = pruneMessageHistory(currentMessages, {
    keepLatestUserImages: hasCurrentImage && isVisionChatModel(selectedModel),
  });
  const prunedMessages = pruneResult.messages;
  // O transcript SQLite hidrata a interface e a memória Mastra fornece o
  // contexto. Primeiro passo: só o user atual. Continuação de client tool:
  // somente a mensagem posterior com o resultado, sem repetir o user.
  const agentInputMessages = botRuntime
    ? selectBotAgentInput(prunedMessages, completedComputerTools.length > 0)
    : prunedMessages;
  logPruneStats(
    currentMessages,
    prunedMessages,
    pruneResult.stats.droppedImageParts,
    pruneResult.stats.droppedEmptyAssistant,
  );

  // Extrai a imagem anexada da última mensagem do usuário (data URL base64)
  // e repassa pela closure da tool generate_video como
  // imagem de origem quando o modelo não a fornece — permitindo gerar vídeo
  // mesmo com um modelo SEM visão computacional (o modelo não precisa "ver"
  // a imagem; o backend a repassa direto à API WaveSpeed).
  const attachedImageDataUrl = generation ? getLatestUserImageDataUrl(currentMessages) : null;

  let persistentRun: {
    id: string;
    capability: TranscriptRunCapability;
    assistantMessageId: string;
  } | null = null;
  let botTextContext: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (botRuntime) {
    const latest = [...currentMessages]
      .reverse()
      .find(
        (item) => item && typeof item === "object" && (item as { role?: unknown }).role === "user",
      ) as { id?: unknown; parts?: unknown[] } | undefined;
    const idempotencyKey =
      typeof latest?.id === "string" && latest.id.length <= 128
        ? latest.id
        : req.headers.get("x-nullain-turn-id");
    if (!idempotencyKey)
      return Response.json(
        { error: "Identificador idempotente do envio ausente." },
        { status: 400 },
      );
    const visibleParts = (latest?.parts ?? [])
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(
          part &&
          typeof part === "object" &&
          (part as { type?: unknown }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
        ),
      )
      .map((part) => ({ type: "text" as const, text: part.text }));
    const userMessage = appendUserTranscript(
      ownerId!,
      botRuntime.bot.id,
      botRuntime.conversation.id,
      { idempotencyKey, parts: visibleParts },
    );
    botTextContext = buildBotTextContext(
      listBotTranscript(ownerId!, botRuntime.bot.id, botRuntime.conversation.id, 20),
      completedComputerTools.length > 0 ? undefined : userMessage.id,
    );
    const interview = botRuntime.bot.isSystem
      ? advanceBotInterview(
          ownerId!,
          botRuntime.conversation.id,
          visibleParts.map((part) => part.text).join("\n"),
        )
      : null;
    if (interview) {
      const structuredParts = [
        { type: "text" as const, text: interview.text },
        ...(interview.kind === "review" ? [interview.part] : []),
      ];
      const persisted = appendServerTranscript(
        ownerId!,
        botRuntime.bot.id,
        botRuntime.conversation.id,
        `bot-interview:${interview.draft.id}:${interview.draft.revision}:${interview.kind}`,
        structuredParts,
      );
      const interviewStream = createUIMessageStream<UIMessage>({
        execute: async ({ writer }) => {
          writer.write({ type: "text-start", id: persisted.id } as never);
          writer.write({ type: "text-delta", id: persisted.id, delta: interview.text } as never);
          writer.write({ type: "text-end", id: persisted.id } as never);
          if (interview.kind === "review")
            writer.write({
              type: "data-bot-review",
              id: `${persisted.id}:review`,
              data: interview.part,
            } as never);
        },
      });
      return createUIMessageStreamResponse({ stream: interviewStream });
    }
    const run = ensureTranscriptRun(
      ownerId!,
      botRuntime.bot.id,
      botRuntime.conversation.id,
      userMessage.id,
    );
    let claim = claimTranscriptRun(ownerId!, botRuntime.bot.id, botRuntime.conversation.id, run.id);
    if (!claim.claimed && claim.run.status === "running" && completedComputerTools.length > 0) {
      claim = resumeTranscriptRun(
        ownerId!,
        botRuntime.bot.id,
        botRuntime.conversation.id,
        run.id,
        completedComputerTools,
      );
    }
    if (!claim.claimed || !claim.capability) {
      if (claim.run.status === "completed") {
        const stored = getTranscriptMessage(
          ownerId!,
          botRuntime.bot.id,
          botRuntime.conversation.id,
          claim.run.assistantMessageId,
        );
        const storedText = stored.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("");
        const replay = createUIMessageStream<UIMessage>({
          execute: async ({ writer }) => {
            writer.write({ type: "text-start", id: stored.id } as never);
            writer.write({ type: "text-delta", id: stored.id, delta: storedText } as never);
            writer.write({ type: "text-end", id: stored.id } as never);
          },
        });
        return createUIMessageStreamResponse({ stream: replay });
      }
      return Response.json(
        { error: `Execução já está ${claim.run.status}.`, run: claim.run },
        { status: claim.run.status === "running" ? 409 : 422 },
      );
    }
    persistentRun = {
      id: run.id,
      capability: claim.capability,
      assistantMessageId: run.assistantMessageId,
    };
    if (completedComputerTools.length > 24) {
      finishTranscriptRun(
        ownerId!,
        botRuntime.bot.id,
        botRuntime.conversation.id,
        persistentRun.capability,
        "failed",
        completedComputerTools,
        "A execução foi interrompida porque excedeu o limite de ações consecutivas.",
      );
      persistentRun = null;
      return Response.json(
        { error: "A execução excedeu o limite de ações consecutivas do computador." },
        { status: 422 },
      );
    }
  }
  const agent = mastra.getAgent("kernelAgent");
  const isReasoningModel = REASONING_MODELS.has(selectedModel);
  // Se o usuário escolheu um effort no seletor, respeita; senão usa o default
  // do benchmark de reasoning (fallback "medium").
  // Com Computador ativo, usa WEB_EFFORT_BY_MODEL: medido no tool-use bench
  // (nullain-tooluse-report.json, 4 tarefas × 10 modelos × 3 efforts), alguns
  // modelos queimam maxSteps raciocinando entre tool calls e terminam sem
  // responder (gpt-oss 20b/120b e qwen3.5 com high = 25% de respostas vazias;
  // kimi-k3 com low/high = 50%).
  const computerEffortOverride = computer ? WEB_EFFORT_BY_MODEL[selectedModel] : undefined;
  const effort =
    reasoningEffort ?? computerEffortOverride ?? DEFAULT_EFFORT_BY_MODEL[selectedModel] ?? "medium";

  const streamOptions: Record<string, unknown> = {
    model: selectedModel as never,
  };
  const requestContext = new RequestContext();
  requestContext.setRaw(
    VISION_INPUT_CONTEXT_KEY,
    hasCurrentImage && isVisionChatModel(selectedModel),
  );
  // Filtros do resolver NATIVO de skills (kernelAgent.skills): o Mastra lê
  // estes valores via requestContext e injeta `skill`/`skill_read`/
  // `skill_search` já filtrados — sem índice manual no system prompt.
  requestContext.setRaw(SKILL_CONTEXT_KEYS.ownerId, ownerId ?? null);
  requestContext.setRaw(SKILL_CONTEXT_KEYS.disabledSkills, disabled);
  requestContext.setRaw(SKILL_CONTEXT_KEYS.grantedSkills, grantedSkills ?? null);
  requestContext.setRaw(SKILL_CONTEXT_KEYS.selectedSkill, selectedSkill?.name ?? null);
  streamOptions.requestContext = requestContext;

  // Kernel: delegação governada em CÓDIGO + memory persistente por thread.
  // O thread/resource vem do header (ou default por sessão) para isolamento.
  const kernelDelegation = kernelStreamOptions();
  streamOptions.delegation = kernelDelegation.delegation;
  streamOptions.maxSteps = 12;
  // Memory do kernel: ativa a janela de conversa + working memory.
  // thread: por conversa de cliente (estável), para a memória persistir
  // entre requests na mesma thread (DoD #4).
  // resource: a working memory do Mastra é resource-scoped (persiste entre
  // threads do MESMO resource). Um valor fixo vazava preferências entre
  // usuários/sessões — por isso o resource é por usuário logado, ou por
  // sessão anônima (threadId estável do navegador).
  streamOptions.memory = {
    thread: botRuntime
      ? `bot-${botRuntime.bot.id}-${botRuntime.conversation.mastraThreadId}`
      : `nt-${requestThreadId}`,
    resource: botRuntime
      ? `user-${ownerId}:bot-${botRuntime.bot.id}:conversation-${botRuntime.conversation.id}`
      : ownerId
        ? `user-${ownerId}`
        : `anon-${requestThreadId}`,
    ...(botRuntime ? { options: { lastMessages: false } } : {}),
  };
  // Nota (verificada no doc `reference-memory-memory-class`): lastMessages:false
  // significa "não carrega nem SALVA mensagens" — para bots, a Memory do Mastra
  // vira no-op deliberado (o transcript SQLite é a fonte canônica; o resource
  // inclui a conversation, então working memory nunca acumularia nada útil).
  // Sem memory tools no toolset, também não há updates de working memory.
  // O transcript SQLite é a fonte canônica do histórico visual. Para bots,
  // carregamos somente seu texto validado como contexto e desativamos a janela
  // de mensagens do Mastra: client tool invocations salvas pelo Mastra podem
  // virar uma sequência OpenAI inválida no turno seguinte.
  if (botRuntime && botTextContext.length > 0) streamOptions.context = botTextContext;

  // Skills NATIVAS (Agent.skills + resolver dinâmico via RequestContext):
  // descoberta progressiva com as tools `skill`/`skill_read`/`skill_search`
  // injetadas pelo Mastra — sem índice manual no prompt. Filtros (dono,
  // desativadas, grants do bot) viajam no requestContext (ver acima).
  // Toolsets condicionais aos toggles do composer:
  // - create_skill: SOMENTE com pedido explícito (allowSkillCreation).
  // - composio (1000+ integrações): SOMENTE quando o toggle Plugins está
  //   ligado. As tools vêm do MCP Composio Connect (meta-tools COMPOSIO_*),
  //   não de toolsets locais — o OAuth é gerenciado pelo próprio Composio.
  // - wavespeed (imagem/vídeo): SOMENTE quando o toggle Geração está ligado.
  // NOTA: AgentStreamOptions NÃO tem campo `tools` — tools avulsas entram
  // como um TOOLSET (Record<string, ToolsInput>). Passar `tools` aqui é
  // ignorado silenciosamente pelo Mastra (bug que escondeu as meta-tools).
  const sessionIntegrationKey = sanitizeIntegrationKey(
    req.headers.get("x-nullain-integration-key"),
  );
  const allowSkillCreation =
    Boolean(ownerId) &&
    !disabled.some((name) => name.toLowerCase() === "skill-creator") &&
    explicitlyRequestsSkillCreation(latestUserText(currentMessages));
  const useLocalComputer = Boolean(computer && botRuntime && isLocalComputerEnabled());

  const { toolsets, composioTools } = await buildChatToolsets({
    ownerId,
    allowSkillCreation,
    botRuntime,
    integrations,
    sessionIntegrationKey,
    generation,
    attachedImageDataUrl,
    useLocalComputer,
  });

  streamOptions.toolsets = toolsets;
  streamOptions.clientTools = {};

  const integrationsAvailable = Object.keys(composioTools).length > 0;
  const requestInstructions = buildChatInstructions({
    botRuntime,
    selectedSkill,
    computer,
    useLocalComputer,
    integrationsAvailable,
    generation,
    generationMode,
  });
  streamOptions.instructions = requestInstructions;
  // Ollama/OpenAI-compatible streams can append empty `{}` deltas after a
  // complete tool input (for example `{"url":"..."}{}{}`). Repair this
  // narrow transport defect before schema validation/tool execution.
  streamOptions.experimental_repairToolCall =
    useLocalComputer && botRuntime && ownerId
      ? createComputerAwareToolCallRepair({
          ownerUserId: ownerId,
          botId: botRuntime.bot.id,
          conversationId: botRuntime.conversation.id,
        })
      : repairMalformedToolCall;
  // NOTA: o maxSteps do kernel (12) é definido acima via kernelStreamOptions e
  // NÃO é sobrescrito aqui — o orçamento/delegação é governado pelos
  // delegation hooks (onDelegationStart), não por ajuste de steps no route.

  // Modelos de raciocínio da Ollama Cloud têm thinking NATIVO (campo `thinking`
  // na resposta da API, convertido em reasoning-delta pelo provider). Não
  // injetamos prompt pedindo tags inline: testado contra a API, isso faz o
  // modelo despejar o raciocínio no conteúdo visível da resposta. Apenas
  // ativamos o thinking nativo; o thinkingExtractor (no toAISdkStream) segue
  // como fallback para modelos que emitirem tags inline no texto.
  //
  // Nota do benchmark: mesmo com effort "low", a API continua retornando
  // reasoning (o modelo raciocina internamente de qualquer forma) — o effort
  // controla o budget, não liga/desliga. Por isso todos os modelos de
  // reasoning recebem providerOptions sempre.
  if (isReasoningModel || reasoningEffort) {
    streamOptions.providerOptions = ollamaProviderOptions(effort);
    streamOptions.modelSettings = { reasoningEffort: effort, think: true };
  }

  try {
    const stream = await agent.stream(agentInputMessages as never, streamOptions as never);

    // Fallback anti-resposta-vazia: quando o modelo queima todos os maxSteps em
    // tool calls (bug medido no gpt-oss:20b com effort alto), o run termina sem
    // nenhum text-delta e o usuário vê silêncio. Detectamos isso inspecionando
    // o fluxo mastra ANTES da conversão p/ UI: se o run acabou sem texto mas
    // houve tool calls, disparamos uma segunda passada SEM tools (activeTools:
    // []) pedindo a resposta final com base nos resultados já coletados, e
    // concatenamos na MESMA resposta do usuário via createUIMessageStream.
    type MastraToolResultChunk = {
      type: string;
      payload?: { toolName?: string; toolCallId?: string; args?: unknown; result?: unknown };
    };
    type MastraChunk = { type?: string; payload?: Record<string, unknown> };
    const toolResultsForRetry: Array<{
      toolName: string;
      toolCallId: string;
      args: unknown;
      result: unknown;
    }> = [];
    let persistedVisibleText = "";
    let needsEmptyFallback = false;
    let awaitsComputerResult = false;
    let fallbackStarted = false;
    let computerToolFailure: string | null = null;
    let computerOutcome = { actionSucceeded: false, failure: null as string | null };
    const persistedAssistantParts = () => {
      const tools = new Map(completedComputerTools.map((tool) => [tool.toolCallId, tool]));
      for (const tool of toolResultsForRetry) {
        if (!/(?:openbot|nullain)_computer_/.test(tool.toolName)) continue;
        tools.set(tool.toolCallId, {
          type: "tool-call",
          version: 1,
          toolName: tool.toolName,
          toolCallId: tool.toolCallId,
          input: tool.args,
          output: tool.result,
        });
      }
      return [...tools.values(), { type: "text" as const, text: persistedVisibleText }];
    };
    // Texto que JÁ foi entregue ao usuário neste stream (via toAISdkStream,
    // depois do monitored). O fallback só pode disparar se NADA foi entregue —
    // um retry em cima de conteúdo visível duplica frases na tela.
    let deliveredTextLength = 0;

    const monitored = stream.fullStream.pipeThrough(
      new NodeTransformStream<unknown, unknown>({
        transform(chunk, controller) {
          const c = chunk as MastraChunk;
          const type = c?.type;
          if (type === "tool-result") {
            const payload = c?.payload as MastraToolResultChunk["payload"] | undefined;
            if (payload) {
              toolResultsForRetry.push({
                toolName: payload.toolName ?? "unknown",
                toolCallId: payload.toolCallId ?? crypto.randomUUID(),
                args: payload.args,
                result: payload.result,
              });
              if (/(?:openbot|nullain)_computer_/.test(payload.toolName ?? "")) {
                const toolName = payload.toolName ?? "";
                computerOutcome = updateComputerToolOutcome(
                  computerOutcome,
                  toolName,
                  payload.result,
                );
                computerToolFailure = computerOutcome.failure;
              }
            }
          }
          if (type === "tool-call") {
            const payload = c?.payload as MastraToolResultChunk["payload"] | undefined;
            if (/openbot_computer_/.test(payload?.toolName ?? "")) {
              awaitsComputerResult = true;
            }
          }
          if (type === "finish" && toolResultsForRetry.length > 0) {
            needsEmptyFallback = true;
          }
          controller.enqueue(chunk as never);
        },
      }),
    );

    const uiMessageStream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        try {
          const passthrough = toAISdkStream(monitored as never, {
            from: "agent",
            version: "v7",
            sendReasoning: true,
            sendStart: true,
            sendFinish: true,
            experimentalTransform: thinkingExtractor(),
            onError: (error: unknown) => errorToText(error),
          });
          const reader = passthrough.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // Conta o texto que de fato chega ao usuário (UI stream). É ESTE
              // comprimento que autoriza o fallback — não o do fluxo mastra,
              // que inclui texto consumido por transforms internos.
              const v = value as { type?: string; delta?: string } | undefined;
              if (v?.type === "error") {
                const errorText = (value as { errorText?: unknown }).errorText;
                throw new Error(
                  typeof errorText === "string" ? errorText : "A execução do modelo falhou.",
                );
              }
              if (v?.type === "text-delta" && typeof v.delta === "string") {
                // A resposta do modelo não pode transformar uma falha real da
                // ferramenta em uma confirmação inventada de sucesso.
                if (computerToolFailure) continue;
                deliveredTextLength += v.delta.trim().length;
                persistedVisibleText += v.delta;
              }
              writer.write(value as never);
            }
          } finally {
            reader.releaseLock();
          }

          if (computerToolFailure) {
            const failureText = `Não consegui concluir a ação no computador: ${computerToolFailure}`;
            persistedVisibleText = failureText;
            writer.write({ type: "text-start", id: "nullain-computer-failure" } as never);
            writer.write({
              type: "text-delta",
              id: "nullain-computer-failure",
              delta: failureText,
            } as never);
            writer.write({ type: "text-end", id: "nullain-computer-failure" } as never);
          }

          // Run terminou sem texto mas com tool results? Refaz sem tools.
          // GUARD DUPLo: só dispara se (a) o fluxo mastra não produziu texto E
          // (b) NADA foi entregue ao usuário. Um retry sobre conteúdo visível
          // duplica frases na tela — o bug das respostas repetidas.
          if (
            needsEmptyFallback &&
            !fallbackStarted &&
            deliveredTextLength === 0 &&
            !computerToolFailure
          ) {
            fallbackStarted = true;
            console.warn(
              `[/api/chat] empty-answer fallback: run ended without text after ${toolResultsForRetry.length} tool calls — retrying without tools`,
            );
            let digestBudget = 6_000;
            const digestParts: string[] = [];
            for (const [i, r] of toolResultsForRetry.entries()) {
              if (digestBudget <= 0) break;
              let resultText = "";
              try {
                resultText = JSON.stringify(r.result, null, 0) ?? "";
              } catch {
                resultText = String(r.result);
              }
              let argsText = "{}";
              try {
                argsText = (JSON.stringify(r.args ?? {}) ?? "{}").slice(0, 500);
              } catch {
                argsText = "[argumentos não serializáveis]";
              }
              const entry =
                `[${i + 1}] ${r.toolName}(${argsText}) => ${resultText.slice(0, 1_200)}`.slice(
                  0,
                  digestBudget,
                );
              digestParts.push(entry);
              digestBudget -= entry.length + 2;
            }
            const digest = digestParts.join("\n\n");

            writer.write({
              type: "text-start",
              id: "nullain-fallback",
            } as never);
            writer.write({
              type: "text-delta",
              id: "nullain-fallback",
              delta: "",
            } as never);

            try {
              const retryOptions: Record<string, unknown> = {
                model: selectedModel as never,
                // Sem tools: o modelo agora SÓ escreve a resposta.
                activeTools: [] as never,
                instructions: `${requestInstructions}

FALLBACK MODE: The tool step budget was exhausted. You already collected the content below. Answer the user's original question NOW using only this information — no more tool calls. Cite sources as markdown links like [domain.com](url). If the results are insufficient, say what you found and what's missing.`,
              };
              if (isReasoningModel || reasoningEffort) {
                // Retry com effort mínimo: o goal é despejar a resposta, não pensar mais.
                retryOptions.providerOptions = ollamaProviderOptions("low");
                retryOptions.modelSettings = { reasoningEffort: "low", think: true };
              }

              const retryStream = await agent.stream(
                [
                  ...agentInputMessages,
                  {
                    role: "user" as const,
                    parts: [
                      {
                        type: "text" as const,
                        text: `You already ran searches and collected these results:\n\n${digest}\n\nNow write the final answer to the original question using these results. Do NOT call any tools.`,
                      },
                    ],
                  },
                ] as never,
                retryOptions as never,
              );

              const retryUi = toAISdkStream(retryStream, {
                from: "agent",
                version: "v7",
                sendReasoning: false,
                sendStart: false,
                sendFinish: false,
                onError: (error: unknown) => errorToText(error),
              });
              const retryReader = retryUi.getReader();
              while (true) {
                const { done, value } = await retryReader.read();
                if (done) break;
                // Só repassamos texto do retry (sem start/finish próprios)
                if ((value as { type?: string })?.type === "text-delta") {
                  const delta = (value as { delta?: unknown }).delta;
                  if (typeof delta === "string") persistedVisibleText += delta;
                  writer.write(value as never);
                }
              }
              retryReader.releaseLock();
            } catch (retryError) {
              console.error("[/api/chat] empty-answer fallback failed:", retryError);
              writer.write({
                type: "text-delta",
                id: "nullain-fallback",
                delta:
                  "\n\n_(A busca foi concluída mas o modelo não gerou a resposta final. Os resultados das buscas estão no histórico — tente reformular.)_",
              } as never);
            } finally {
              writer.write({ type: "text-end", id: "nullain-fallback" } as never);
            }
          }
          if (persistentRun && botRuntime && !awaitsComputerResult) {
            finishTranscriptRun(
              ownerId!,
              botRuntime.bot.id,
              botRuntime.conversation.id,
              persistentRun.capability,
              "completed",
              persistedAssistantParts(),
            );
            persistentRun = null;
          }
        } catch (streamError) {
          if (persistentRun && botRuntime) {
            finishTranscriptRun(
              ownerId!,
              botRuntime.bot.id,
              botRuntime.conversation.id,
              persistentRun.capability,
              "failed",
              persistedAssistantParts(),
            );
            persistentRun = null;
          }
          throw streamError;
        }
      },
      onError: (error) => errorToText(error),
    });

    return createUIMessageStreamResponse({ stream: uiMessageStream });
  } catch (error) {
    if (persistentRun && botRuntime) {
      try {
        finishTranscriptRun(
          ownerId!,
          botRuntime.bot.id,
          botRuntime.conversation.id,
          persistentRun.capability,
          "failed",
          [{ type: "text", text: "" }],
        );
      } catch {
        /* preserve original error */
      }
    }
    // Em vez de um 500 que a UI engole em silêncio, devolve um stream de UI
    // com a parte de erro — o MessageError do thread.tsx renderiza.
    const message = errorToText(error);
    console.error("[/api/chat] agent.stream failed:", error);

    const errorStream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: "error", errorText: message });
      },
      onError: () => message,
    });

    return createUIMessageStreamResponse({ stream: errorStream });
  }
}
