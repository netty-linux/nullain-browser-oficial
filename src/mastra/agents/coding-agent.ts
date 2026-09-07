import { Agent } from "@mastra/core/agent";
import { MODELS } from "../models";

/**
 * codingAgent — PROCESSO de escrita de código.
 *
 * Um agente = uma responsabilidade. Este agente recebe uma spec e devolve
 * implementação + testes + resumo de decisões. Escopado ao mínimo: neste
 * kernel ele NÃO tem tools de execução/fs por padrão (se uma feature futura
 * precisar compilar/rodar, vira outro processo — não empilhe tools aqui).
 * Tools declaradas no agente ficam SEMPRE expostas ao modelo (listTools),
 * por isso este processo é deliberadamente enxuto.
 */
export const codingAgent = new Agent({
  id: "coding-agent",
  name: "Coding Agent",
  description:
    "Escreve, corrige e explica código. Recebe uma especificação (spec) e devolve implementação TypeScript/JavaScript + testes + um resumo das decisões técnicas. Não executa código nem altera o filesystem.",
  model: MODELS.coding,
  tools: {},
  instructions: `Você é o processo de CÓDIGO do Nullain. Recebe uma especificação e devolve:
1. Implementação completa e em TypeScript estrito (ou JS, se a spec pedir).
2. Testes para a implementação.
3. Um resumo curto das decisões técnicas (por que escolheu tal abordagem).

Regras:
- Siga a spec à risca; se algo estiver ambíguo, escolha a opção mais simples e documente a decisão no resumo.
- Código limpo, tipado, sem APIs proibidas (child_process, eval, rede não solicitada).
- Não execute o código Nem altere arquivos: seu papel é apenas produzir e explicar código.`,
});
