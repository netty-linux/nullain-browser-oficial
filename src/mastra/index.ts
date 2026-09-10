import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { chatAgent } from "./agents/chat-agent";
import { kernelAgent, KERNEL_POLICY } from "./agents/kernel-agent";
import { codingAgent } from "./agents/coding-agent";
import { synthesisAgent } from "./agents/synthesis-agent";
import { createNullainCodeController } from "./nullain-code/controller";

/**
 * ============================================================================
 * Nullain AgenticOS — Runtime Mastra (bootloader).
 *
 * Anatomia target:
 *   - storage LibSQL persistente em arquivo (NUNCA :memory: em produção).
 *   - agents: kernel (supervisor) + sub-processos + o legado chatAgent
 *     preservado para NÃO quebrar a interface de cliente.
 *
 * META-AGENT REMOVIDO (2026-09-06): a Nullain funciona apenas com o que já
 * está integrado (kernel + sub-agentes + computador). Sem geração de agentes.
 *
 * Memory do kernel: vive no construtor do kernelAgent (ver kernel-agent.ts),
 * com storage LibSQL próprio de mesmo arquivo — NÃO duplicar aqui para evitar
 * duas instâncias de Memory registrando duas conexões no mesmo .db.
 * ============================================================================
 */

// Storage global — persistido em arquivo (file:mastra.db), compartilhado
// entre workflows e agentes legados.
export const mastraStorage = new LibSQLStore({
  id: "nullain",
  url: process.env.NULLAIN_DB_URL ?? "file:mastra.db",
});

export const nullainCodeController = createNullainCodeController(mastraStorage);

export const mastra = new Mastra({
  agents: {
    // Kernel (supervisor) + processos governados.
    kernelAgent,
    codingAgent,
    synthesisAgent,
    // LEGADO preservado (zero breaking change na interface de cliente):
    // Mantido para clientes legados e para o endpoint AG-UI.
    chatAgent,
  },
  agentControllers: {
    nullainCode: nullainCodeController,
  },
  storage: mastraStorage,
  // Logger estruturado (Pino): dá trace_id/span_id nas operações do Mastra
  // (delegações, tools, memory) em vez do `logger: false` anterior, que
  // apagava toda a telemetria interna. Os logs de decisão do kernel
  // ([kernel:delegation]) continuam via console.info.
  logger: new PinoLogger({ name: "nullain", level: "info" }),
});

/** Exporta para as rotas usarem o kernel por id (DoD #1). */
export function getKernel() {
  return mastra.getAgent("kernelAgent");
}

export { KERNEL_POLICY };
