import type { MastraStreamTransform, ChunkType } from "@mastra/core/stream";

const TAG_PATTERNS = [
  { open: " thinking", close: " response" },
  { open: "<thinking>", close: "</thinking>" },
  { open: "<thought>", close: "</thought>" },
] as const;

const SELF_CLOSING_TAGS = ["<think/>"] as const;
const HARMONY_START = "<|start|>";
const HARMONY_CHANNEL = "<|channel|>";
const HARMONY_MESSAGE = "<|message|>";
const HARMONY_END = "<|end|>";

type HarmonyPhase = "plain" | "header" | "channel" | "content";

function safePrefixLength(value: string, markers: readonly string[]): number {
  let retained = 0;
  for (const marker of markers) {
    const max = Math.min(value.length, marker.length - 1);
    for (let length = max; length > retained; length -= 1) {
      if (marker.startsWith(value.slice(-length))) {
        retained = length;
        break;
      }
    }
  }
  return value.length - retained;
}

/**
 * Remove o protocolo Harmony que alguns modelos Ollama devolvem dentro do
 * próprio text-delta. O parser é incremental porque os tokens podem ser
 * divididos entre chunks; somente o canal `final` vira texto visível.
 */
export function createHarmonyTextSanitizer() {
  let phase: HarmonyPhase = "plain";
  let channel = "";
  let buffer = "";

  const process = (flush = false) => {
    let output = "";
    while (buffer) {
      if (phase === "plain") {
        const start = buffer.indexOf(HARMONY_START);
        const channelStart = buffer.indexOf(HARMONY_CHANNEL);
        const candidates = [start, channelStart].filter((index) => index >= 0);
        if (candidates.length) {
          const index = Math.min(...candidates);
          output += buffer.slice(0, index);
          if (index === start) {
            buffer = buffer.slice(index + HARMONY_START.length);
            phase = "header";
          } else {
            buffer = buffer.slice(index + HARMONY_CHANNEL.length);
            phase = "channel";
          }
          continue;
        }
        const safe = flush
          ? buffer.length
          : safePrefixLength(buffer, [HARMONY_START, HARMONY_CHANNEL]);
        output += buffer.slice(0, safe);
        buffer = buffer.slice(safe);
        break;
      }

      if (phase === "header") {
        const index = buffer.indexOf(HARMONY_CHANNEL);
        if (index >= 0) {
          buffer = buffer.slice(index + HARMONY_CHANNEL.length);
          phase = "channel";
          continue;
        }
        if (flush) buffer = "";
        else {
          const safe = safePrefixLength(buffer, [HARMONY_CHANNEL]);
          buffer = buffer.slice(safe);
        }
        break;
      }

      if (phase === "channel") {
        const index = buffer.indexOf(HARMONY_MESSAGE);
        if (index >= 0) {
          channel = buffer.slice(0, index).trim().toLowerCase();
          buffer = buffer.slice(index + HARMONY_MESSAGE.length);
          phase = "content";
          continue;
        }
        if (flush) buffer = "";
        break;
      }

      const end = buffer.indexOf(HARMONY_END);
      if (end >= 0) {
        if (channel === "final") output += buffer.slice(0, end);
        buffer = buffer.slice(end + HARMONY_END.length);
        channel = "";
        phase = "plain";
        continue;
      }
      const safe = flush ? buffer.length : safePrefixLength(buffer, [HARMONY_END]);
      if (channel === "final") output += buffer.slice(0, safe);
      buffer = buffer.slice(safe);
      break;
    }
    return output;
  };

  return {
    push(text: string) {
      buffer += text;
      return process(false);
    },
    flush() {
      return process(true);
    },
  };
}

const CHINESE_MARKER = "\u601D\u8003\uFF1A";
const CHINESE_END_MARKERS = [
  "\n\n",
  "\nResposta:",
  "\nAnswer:",
  "\nFinal Answer:",
  "\nFinal:",
  "Resposta final:",
  "Final answer:",
  "Answer:",
];

type Phase = "text" | "reasoning";
type ReasoningMode = "tag" | "chinese";

interface OpeningMatch {
  open: string;
  close: string;
  index: number;
  mode: ReasoningMode;
}

function findEarliestOpening(buffer: string): OpeningMatch | null {
  let result: OpeningMatch | null = null;

  for (const pattern of TAG_PATTERNS) {
    const idx = buffer.indexOf(pattern.open);
    if (idx !== -1 && (result === null || idx < result.index)) {
      result = { open: pattern.open, close: pattern.close, index: idx, mode: "tag" };
    }
  }

  const chIdx = buffer.indexOf(CHINESE_MARKER);
  if (chIdx !== -1 && (result === null || chIdx < result.index)) {
    result = { open: CHINESE_MARKER, close: "", index: chIdx, mode: "chinese" };
  }

  return result;
}

function findClosingTagIndex(
  buffer: string,
  closeTag: string,
  mode: ReasoningMode,
): { index: number; consumedLength: number } | null {
  if (mode === "tag") {
    const idx = buffer.indexOf(closeTag);
    if (idx !== -1) return { index: idx, consumedLength: closeTag.length };
    return null;
  }

  for (const marker of CHINESE_END_MARKERS) {
    const idx = buffer.indexOf(marker);
    if (idx !== -1) return { index: idx, consumedLength: marker.length };
  }
  return null;
}

function isPartialTagPrefix(text: string): boolean {
  for (const pattern of TAG_PATTERNS) {
    if (pattern.open.startsWith(text) && text.length < pattern.open.length) return true;
    if (pattern.close.startsWith(text) && text.length < pattern.close.length) return true;
  }
  for (const tag of SELF_CLOSING_TAGS) {
    if (tag.startsWith(text) && text.length < tag.length) return true;
  }
  if (CHINESE_MARKER.startsWith(text) && text.length < CHINESE_MARKER.length) return true;
  return false;
}

function findSafeEnd(buffer: string, phase: Phase, mode: ReasoningMode): number {
  const lastLt = buffer.lastIndexOf("<");
  if (lastLt !== -1) {
    const tail = buffer.slice(lastLt);
    if (isPartialTagPrefix(tail)) return lastLt;
  }

  const lastChinese = buffer.lastIndexOf("思");
  if (lastChinese !== -1 && (lastLt === -1 || lastChinese > lastLt)) {
    const tail = buffer.slice(lastChinese);
    if (CHINESE_MARKER.startsWith(tail) && tail.length < CHINESE_MARKER.length) {
      return lastChinese;
    }
  }

  if (phase === "reasoning" && mode === "chinese") {
    if (buffer.endsWith("\n")) {
      return buffer.length - 1;
    }
    for (const marker of CHINESE_END_MARKERS) {
      const maxLen = Math.min(marker.length - 1, buffer.length);
      for (let len = maxLen; len > 0; len--) {
        const tail = buffer.slice(buffer.length - len);
        if (marker.startsWith(tail) && tail.length < marker.length) {
          return buffer.length - len;
        }
      }
    }
  }

  if (phase === "text") {
    // Segura um pseudo-header parcial no fim do buffer (ex.: chunk terminou
    // em "to=functions.nullain_computer_cl") para não emitir metade dele
    // antes do strip decidir com o texto completo.
    const partial = partialBareHeaderStart(buffer);
    if (partial >= 0 && partial < buffer.length) return partial;
  }

  return buffer.length;
}

function removeSelfClosingTags(buffer: string): string {
  let result = buffer;
  for (const tag of SELF_CLOSING_TAGS) {
    result = result.split(tag).join("");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pseudo tool-calls em texto ("Harmony sem delimitadores").
//
// Alguns modelos Ollama emitem chamadas como TEXTO puro, sem os marcadores
// `<|start|>/<|channel|>/<|message|>/<|end|>`:
//
//   to=functions.nullain_computer_clickjson{"ref":"x","snapshotId":0}commentary
//   assistant to=commentaryDesculpe, ...
//
// Isso NUNCA é uma tool call real (nenhum resultado volta) e vaza na resposta
// visível — exatamente o `to=functions...` que aparecia no chat. Remove o
// header, o bloco `json{...}` balanceado e um `commentary` colado logo após.
// Texto legítimo (código, prosa) nunca contém `to=functions.` e é preservado.
// ---------------------------------------------------------------------------

const BARE_FN_PREFIX = "to=functions.";
const BARE_FN_NAME_CHARS = /[A-Za-z0-9_.-]/;

function findBalancedBraceEnd(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Estado entre chunks para payload `json{...}` parcial de pseudo-call. */
export type BareCallStripState = { payloadDepth: number };

export function createBareCallStripState(): BareCallStripState {
  return { payloadDepth: 0 };
}

function consumeOpenPayload(text: string, state: BareCallStripState): string {
  if (state.payloadDepth <= 0) return text;
  let depth = state.payloadDepth;
  let inString = false;
  let escaped = false;
  let index = 0;
  for (; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth <= 0) {
        state.payloadDepth = 0;
        return text.slice(index + 1);
      }
    }
  }
  state.payloadDepth = depth;
  return "";
}

function stripBareFunctionCalls(text: string, flush: boolean, state: BareCallStripState): string {
  // 0. Resto de payload de pseudo-call anterior (profundidade entre chunks).
  let out = consumeOpenPayload(text, state);
  if (!out) return out;
  // 1. Headers de canal nus: `[assistant ]to=commentary|final`.
  //    Remove SÓ o header e mantém o texto seguinte (se o modelo despejou a
  //    resposta no canal `commentary`, exibi-la é melhor que silêncio).
  //    `commentary` colado em maiúscula (`commentaryDesculpe`) também vale.
  out = out
    .replace(/(^|\s)(?:assistant\s+)?to=commentary(?=\s|$|[A-ZÀ-Ú])/g, "$1")
    .replace(/(^|\s)(?:assistant\s+)?to=final\b\s*/g, "$1");

  // 2. Pseudo-calls `to=functions.NOME [json{...}] [commentary]`.
  let result = "";
  let cursor = 0;
  while (true) {
    const headerIndex = out.indexOf(BARE_FN_PREFIX, cursor);
    if (headerIndex < 0) {
      result += out.slice(cursor);
      break;
    }
    // Inclui um eventual prefixo "assistant " colado ao header.
    let start = headerIndex;
    const before = out.slice(Math.max(0, headerIndex - 10), headerIndex);
    const assistantPrefix = /assistant\s+$/.exec(before);
    if (assistantPrefix) start = headerIndex - assistantPrefix[0].length;
    result += out.slice(cursor, start);

    let end = headerIndex + BARE_FN_PREFIX.length;
    while (end < out.length && BARE_FN_NAME_CHARS.test(out[end]!)) end += 1;
    // `json` colado ao nome (`...clickjson{...}`): o sufixo é o canal, não
    // parte do nome da tool — desde que um `{` venha em seguida.
    let nameEnd = end;
    if (
      nameEnd - (headerIndex + BARE_FN_PREFIX.length) > 4 &&
      out.slice(nameEnd - 4, nameEnd) === "json"
    ) {
      let probe = nameEnd;
      while (probe < out.length && /\s/.test(out[probe]!)) probe += 1;
      if (out[probe] === "{") nameEnd -= 4;
    }
    // Bloco `json{...}` opcional com chaves balanceadas.
    let scan = nameEnd;
    while (scan < out.length && /\s/.test(out[scan]!)) scan += 1;
    if (out.startsWith("json", scan)) {
      let brace = scan + 4;
      while (brace < out.length && /\s/.test(out[brace]!)) brace += 1;
      if (out[brace] === "{") {
        const close = findBalancedBraceEnd(out, brace);
        if (close >= 0) {
          end = close + 1;
        } else if (flush) {
          // Stream terminou no meio do JSON: descarta o resto.
          cursor = out.length;
          break;
        } else {
          // Chunk parcial: o `{` abriu o payload da pseudo-call — descarta o
          // header e marca a profundidade; o resto é consumido via estado nos
          // próximos chunks (nunca vaza como texto).
          state.payloadDepth = 1;
          cursor = out.length;
          break;
        }
      }
    } else {
      end = nameEnd;
    }
    // Palavra `commentary` colada logo após o header/payload.
    const tail = out.slice(end).match(/^\s*commentary(?=\s|$|[A-ZÀ-Ú])/);
    if (tail) end += tail[0].length;
    cursor = end;
  }
  return result;
}

/** Início de um header parcial no fim do buffer (segura até completar). */
function partialBareHeaderStart(buffer: string): number {
  const patterns = [
    /(^|\s)assistant\s*$/,
    /(^|\s)(?:assistant\s+)?to\s*=$/,
    /(^|\s)(?:assistant\s+)?to=[A-Za-z0-9_.]*$/,
    /json\s*\{[^{}]*$/,
  ];
  let start = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(buffer);
    if (match?.index !== undefined) {
      const anchor = match[1]?.length ?? 0;
      const candidate = match.index + anchor;
      if (candidate > start) start = candidate;
    }
  }
  return start;
}

export function thinkingExtractor(): MastraStreamTransform<undefined> {
  return (() => {
    let phase: Phase = "text";
    let reasoningMode: ReasoningMode = "tag";
    let closeTag = "";
    let buffer = "";
    let textId = "text-1";
    let reasoningCounter = 0;
    let currentReasoningId = "";
    let runId = "";
    let chunkFrom: unknown = undefined;
    // True assim que o modelo emite reasoning nativo (reasoning-start/delta/
    // end). Desliga a extração inline de tags — senão o mesmo pensamento viria
    // duplicado (nativo + re-extraído do texto), e o reasoning apareceria 2x
    // na mensagem final.
    let sawNativeReasoning = false;
    const harmony = createHarmonyTextSanitizer();
    const bareCallState = createBareCallStripState();

    function makeChunk(type: string, payload: Record<string, unknown>): ChunkType<undefined> {
      return { type, runId, from: chunkFrom, payload } as ChunkType<undefined>;
    }

    function emitText(
      controller: TransformStreamDefaultController<ChunkType<undefined>>,
      text: string,
    ) {
      if (!text) return;
      controller.enqueue(makeChunk("text-delta", { id: textId, text }));
    }

    function startReasoning(controller: TransformStreamDefaultController<ChunkType<undefined>>) {
      reasoningCounter++;
      currentReasoningId = `reasoning-${reasoningCounter}`;
      controller.enqueue(makeChunk("reasoning-start", { id: currentReasoningId }));
    }

    function emitReasoning(
      controller: TransformStreamDefaultController<ChunkType<undefined>>,
      text: string,
    ) {
      if (!text) return;
      controller.enqueue(makeChunk("reasoning-delta", { id: currentReasoningId, text }));
    }

    function endReasoning(controller: TransformStreamDefaultController<ChunkType<undefined>>) {
      if (!currentReasoningId) return;
      controller.enqueue(makeChunk("reasoning-end", { id: currentReasoningId }));
      currentReasoningId = "";
    }

    function processBuffer(controller: TransformStreamDefaultController<ChunkType<undefined>>) {
      while (buffer.length > 0) {
        if (phase === "text") {
          buffer = removeSelfClosingTags(buffer);
          buffer = stripBareFunctionCalls(buffer, false, bareCallState);
          if (buffer.length === 0) break;

          const opening = findEarliestOpening(buffer);
          if (opening) {
            if (opening.index > 0) {
              emitText(controller, buffer.slice(0, opening.index));
            }
            startReasoning(controller);
            phase = "reasoning";
            reasoningMode = opening.mode;
            closeTag = opening.close;
            buffer = buffer.slice(opening.index + opening.open.length);
          } else {
            const safeEnd = findSafeEnd(buffer, "text", "tag");
            if (safeEnd > 0) {
              emitText(controller, buffer.slice(0, safeEnd));
              buffer = buffer.slice(safeEnd);
            }
            break;
          }
        } else {
          const closing = findClosingTagIndex(buffer, closeTag, reasoningMode);
          if (closing) {
            if (closing.index > 0) {
              emitReasoning(controller, buffer.slice(0, closing.index));
            }
            endReasoning(controller);
            buffer = buffer.slice(closing.index + closing.consumedLength);
            phase = "text";
            reasoningMode = "tag";
            closeTag = "";
          } else {
            const safeEnd = findSafeEnd(buffer, "reasoning", reasoningMode);
            if (safeEnd > 0) {
              emitReasoning(controller, buffer.slice(0, safeEnd));
              buffer = buffer.slice(safeEnd);
            }
            break;
          }
        }
      }
    }

    function processVisibleText(
      controller: TransformStreamDefaultController<ChunkType<undefined>>,
      text: string,
    ) {
      if (!text) return;
      if (sawNativeReasoning) emitText(controller, text);
      else {
        buffer += text;
        processBuffer(controller);
      }
    }

    return new TransformStream<ChunkType<undefined>, ChunkType<undefined>>({
      transform(chunk, controller) {
        if (!runId) runId = chunk.runId;
        if (chunkFrom === undefined) chunkFrom = chunk.from;

        if (chunk.type === "text-start") {
          const payload = chunk.payload as { id?: string };
          if (payload?.id) textId = payload.id;
          if (buffer) {
            processBuffer(controller);
            buffer = "";
          }
          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === "text-end") {
          processVisibleText(controller, harmony.flush());
          if (buffer) {
            processBuffer(controller);
            buffer = "";
          }
          if (phase === "reasoning") {
            endReasoning(controller);
            phase = "text";
          }
          controller.enqueue(chunk);
          return;
        }

        if (
          chunk.type === "reasoning-start" ||
          chunk.type === "reasoning-delta" ||
          chunk.type === "reasoning-end"
        ) {
          // O modelo já emitiu reasoning NATIVO. A partir daqui a extração
          // inline de tags no texto seria DUPLICATA — o mesmo pensamento viria
          // nativo E re-extraído do texto. Desliga a extração inline para o
          // resto do stream (o reasoning nativo é a fonte única).
          sawNativeReasoning = true;
          if (buffer && phase === "text") {
            processBuffer(controller);
            buffer = "";
          }
          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === "text-delta") {
          const payload = chunk.payload as { id?: string; text?: string };
          if (payload?.id) textId = payload.id;
          // Com reasoning nativo, o texto vai direto (sem procurar tags inline
          // — evitaria duplicar o que já veio como reasoning-delta nativo).
          if (payload?.text) {
            processVisibleText(controller, harmony.push(payload.text));
          }
          return;
        }

        if (buffer) {
          processBuffer(controller);
          buffer = "";
        }
        if (phase === "reasoning") {
          endReasoning(controller);
          phase = "text";
        }
        controller.enqueue(chunk);
      },

      flush(controller) {
        processVisibleText(controller, harmony.flush());
        if (buffer) {
          if (phase === "text") {
            buffer = removeSelfClosingTags(buffer);
            buffer = stripBareFunctionCalls(buffer, true, bareCallState);
            if (buffer) emitText(controller, buffer);
          } else {
            if (buffer) emitReasoning(controller, buffer);
            endReasoning(controller);
          }
          buffer = "";
        } else if (phase === "reasoning") {
          endReasoning(controller);
        }
      },
    });
  }) as MastraStreamTransform<undefined>;
}
