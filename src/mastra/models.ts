/**
 * Nullain AgenticOS — centralização de modelos por CAMADA de custo.
 *
 * Um agente = um processo. Em vez de espalhar model strings por cada agent,
 * define aqui os três papéis de custo (kernel/worker/mini) e os específicos,
 * todos com fallback via env seguindo as convenções já usadas no repo
 * (MASTRA_MODEL, MASTRA_MODEL_CHEAP, MASTRA_MODEL_STRONG).
 *
 * Regra de engenharia: kernel = forte (coordenação/raciocínio); execução =
 * barato/rápido (custo por processo). NUNCA usar modelo forte num subagente
 * de execução, nem modelo barato no kernel.
 */

export const MODELS = {
  /** Nullain Code — controlador interativo de projeto, independente do codingAgent legado. */
  nullainCode: process.env.MASTRA_MODEL_NULLAIN_CODE ?? "ollama-cloud/deepseek-v4-flash:0731",

  /**
   * Kernel (supervisor) — coordenação, síntese, tom da persona.
   * Default igual ao chat atual (gpt-oss:20b), forte o bastante para
   * raciocínio de coordenação sem custo de topo-de-linha.
   */
  kernel: process.env.MASTRA_MODEL_KERNEL ?? process.env.MASTRA_MODEL ?? "ollama-cloud/gpt-oss:20b",

  /**
   * Research — processo de pesquisa na web. Barato/rápido: gasta tokens em
   * chamadas do computador, não em raciocínio caro.
   */
  research:
    process.env.MASTRA_MODEL_RESEARCH ??
    process.env.MASTRA_MODEL_CHEAP ??
    "ollama-cloud/glm-5.3-flash",

  /**
   * Coding — processo de escrita de código. Forte: gera implementação +
   * testes, precisa de qualidade. Usa o modelo strong configurado.
   */
  coding:
    process.env.MASTRA_MODEL_CODING ??
    process.env.MASTRA_MODEL_STRONG ??
    "ollama-cloud/gpt-oss:120b",

  /**
   * Synthesis — transforma resultados parciais em resposta final.
   * Não busca dados novos; só formata. Médio/barato.
   */
  synthesis:
    process.env.MASTRA_MODEL_SYNTHESIS ??
    process.env.MASTRA_MODEL ??
    "ollama-cloud/deepseek-v4-flash:0731",
} as const;

/** Modelos de raciocínio com thinking nativo (para providerOptions/effort). */
export const REASONING_MODELS = new Set<string>([
  "ollama-cloud/gpt-oss:20b",
  "ollama-cloud/gpt-oss:120b",
  "ollama-cloud/deepseek-v4-flash:0731",
  "ollama-cloud/deepseek-v4-pro:0813",
  "ollama-cloud/kimi-k3",
  "ollama-cloud/kimi-k2.7-code",
  "ollama-cloud/glm-5.3",
  "ollama-cloud/glm-5.2",
  "ollama-cloud/glm-5.1",
  "ollama-cloud/glm-5.3-flash",
  "ollama-cloud/qwen3.5",
  "ollama-cloud/nemotron-3-ultra",
  "ollama-cloud/nemotron-3-nano:30b",
]);

/** providerOptions p/ Ollama Cloud (@ai-sdk/openai-compatible): só
 * `reasoningEffort` é reconhecido (verificado no provider v3.0.37). */
export function ollamaProviderOptions(effort: string): Record<string, Record<string, unknown>> {
  return { "ollama-cloud": { reasoningEffort: effort } };
}
