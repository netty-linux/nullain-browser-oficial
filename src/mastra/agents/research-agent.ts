import { Agent } from "@mastra/core/agent";
import { MODELS } from "../models";
import { openbotComputerClientTools } from "../tools/computer-client-tools";

/**
 * researchAgent — PROCESSO de pesquisa na web via COMPUTADOR.
 *
 * Um agente = uma responsabilidade. Este agente pesquisa USANDO O COMPUTADOR
 * (openbot_computer_navigate): browser real, humanizado, que abre busca e
 * sites e devolve o texto legível. NÃO há web_search (SearXNG removido) — o
 * computador É o único acesso à web.
 *
 * As políticas de orçamento (não repetir URL, deixar 1 passo para a resposta)
 * NÃO vivem aqui em instructions de texto: são aplicadas em CÓDIGO pelos
 * delegation hooks do kernel (modifica o prompt e o maxSteps do research).
 *
 * Isolamento de memória: o Mastra cria thread/resource separados para o
 * sub-agente automaticamente — NÃO forçamos compartilhamento com o kernel.
 * Isso é feature (isolamento de processo), não bug.
 */
export const researchAgent = new Agent({
  id: "research-agent",
  name: "Research Agent",
  description:
    "Pesquisa na web usando o computador (openbot_computer_navigate): abre buscas e sites num browser real e devolve um resumo estruturado. Use quando o pedido exige informação atual, recente, fatos verificáveis ou fontes citáveis. Nunca repete a mesma URL e SEMPRE cita fontes como markdown links com o domínio.",
  model: MODELS.research,
  // SEM server tools: ferramentas do computador (openbot_computer_navigate)
  // são CLIENT tools declaradas pelo route.ts e disponíveis quando o toggle
  // Computador está ligado.
  tools: {},
  // CORREÇÃO (2026-09-07): a delegação do @mastra/core 1.64 NÃO forwarda o
  // `clientTools` passado pelo route.ts ao sub-agente — o research rodava com
  // ZERO tools (o provider recebia []) e as instruções abaixo pediam
  // openbot_computer_navigate. As defaultOptions do sub-agente sobrevivem ao
  // forward da delegação (validado com probe: provider passa a receber as 7
  // openbot_computer_*). Governança preservada: com o toggle Computador
  // DESLIGADO, o onDelegationStart do kernel rejeita esta delegação em código
  // (kernel-agent.ts) — as tools só são exercitáveis com o consentimento do
  // usuário no toggle.
  // (cast `as never` no padrão do route.ts: o ToolsInput do Mastra 1.64 não
  // aceita o tipo Tool do AI SDK, embora o runtime aceite — o route.ts faz o
  // mesmo ao passar clientTools em streamOptions.)
  defaultOptions: { clientTools: openbotComputerClientTools as never },
  instructions: `Você é o processo de PESQUISA do Nullain. Sua responsabilidade exclusiva é buscar fontes na web e devolver um resumo estruturado.

O COMPUTADOR é a sua única e mais poderosa ferramenta: um browser real, humanizado (movimento de mouse, delays, scroll natural) e imune a anti-bot. Use-o para acessar QUALQUER site — notícias, artigos, documentação, fóruns — e extrair o conteúdo completo. Não se limite a buscadores.

Fluxo:
1. Para notícias/informação atual, abra um buscador NO COMPUTADOR com openbot_computer_navigate: https://www.bing.com/search?q=<query-url-encoded> (geral) ou https://news.google.com (notícias) — e leia os resultados do texto da página. NÃO use duckduckgo.com: ele bloqueia automação com erro 418 mesmo em browser real; o Bing e o Google News são tolerantes.
2. Para ler o conteúdo completo de um resultado promissor, abra a URL no computador — o browser real renderiza a página e devolve o texto legível (até ~20k caracteres). Nunca abra a mesma URL duas vezes.
3. Se uma busca/página devolver pouquíssimo texto, o computador automaticamente aplica OCR (screenshot → reconhecimento) para capturar texto desenhado em imagens/canvas.

Regras de citação e honestidade:
- Cite CADA afirmação factual com um markdown link incluindo o domínio, ex.: [exemplo.com.br](https://...).
- Se uma busca falhar ou não trouxer nada útil, diga isso honestamente no resumo — NUNCA invente informação.
- Se uma página não carregar no computador, NÃO tente a mesma URL de novo: abra OUTRA URL ou responda com base no que já leu.
- Sintetize suas descobertas de forma clara, agrupadas por tema, terminando com a lista de fontes usadas.`,
});
