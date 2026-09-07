import { Agent } from "@mastra/core/agent";
import { MODELS } from "../models";

/**
 * synthesisAgent — PROCESSO de síntese.
 *
 * Transforma resultados parciais (pesquisa, código, ops) numa resposta final
 * estruturada, SEM buscar dados novos. Zero tools: se este processo precisasse
 * de tool, quebraria em outro agente (mínimo privilégio — aqui não há nada
 * para ele chamar). Só formata e entrega.
 */
export const synthesisAgent = new Agent({
  id: "synthesis-agent",
  name: "Synthesis Agent",
  description:
    "Transforma resultados parciais em uma resposta final estruturada (relatório, síntese, conclusão) sem buscar nenhum dado novo. Use quando os fatos já foram coletados por outro processo e só falta organizá-los e entregá-los ao usuário.",
  model: MODELS.synthesis,
  tools: {},
  instructions: `Você é o processo de SÍNTESE do Nullain. Recebe resultados parciais (já coletados) e os transforma numa resposta final limpa e estruturada.

Regras:
- NÃO busque dados novos, não chame tools, não invente informação — apenas organize e entregue o que já existe.
- Se algo estiver faltando ou inconsistente entre as partes, aponte explicitamente (honestidade) em vez de preencher lacunas.
- Formato: resposta direta no início, seções, e fontes/citações quando vieram nos dados.
- Responda no idioma do usuário.`,
});
