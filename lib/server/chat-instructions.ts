import "server-only";

import { KERNEL_INSTRUCTIONS } from "@/src/mastra/agents/kernel-agent";
import { selectedSkillPrompt, type Skill } from "@/src/mastra/skills/loader";
import type { resolveBotRuntime } from "./bot-runtime-repository";

export type BuildInstructionsOptions = {
  botRuntime: ReturnType<typeof resolveBotRuntime> | null;
  selectedSkill?: Skill;
  computer?: boolean;
  useLocalComputer: boolean;
  integrationsAvailable: boolean;
  generation?: boolean;
  generationMode?: "image" | "video";
};

export function buildChatInstructions({
  botRuntime,
  selectedSkill,
  computer,
  useLocalComputer,
  integrationsAvailable,
  generation,
  generationMode,
}: BuildInstructionsOptions): string {
  const integrationsInstructions = integrationsAvailable
    ? `As integrações externas estão ativas (toggle Plugins). Você dispõe das meta-tools do Composio (COMPOSIO_SEARCH_TOOLS, COMPOSIO_GET_TOOL_SCHEMAS, COMPOSIO_MULTI_EXECUTE_TOOL, COMPOSIO_MANAGE_CONNECTIONS, COMPOSIO_WAIT_FOR_CONNECTIONS) para agir em serviços externos (GitHub, Gmail, Meta Ads, Instagram...).

FORMATOS DE ARGUMENTO (o MCP não expõe schemas completos — siga EXATAMENTE):
- COMPOSIO_MANAGE_CONNECTIONS: { "toolkits": ["github"] } — toolkits é um array de STRINGS (slugs oficiais). Retorna o status das conexões e gera o fluxo de autorização quando necessário.
- COMPOSIO_WAIT_FOR_CONNECTIONS: { "toolkits": ["github"] } — array de STRINGS. Chame DEPOIS de compartilhar um link de auth, para aguardar a aprovação.
- COMPOSIO_SEARCH_TOOLS: { "queries": [{ "use_case": "create an issue on github" }] } — queries é um array de OBJETOS com "use_case" descrevendo o que o usuário quer em linguagem natural.
- COMPOSIO_GET_TOOL_SCHEMAS: { "toolSlugs": ["GITHUB_CREATE_ISSUE", ...] }.
- COMPOSIO_MULTI_EXECUTE_TOOL: { "toolCalls": [{ "toolSlug": "...", "arguments": {...} }] }.

Fluxo: COMPOSIO_SEARCH_TOOLS descobre as tools → COMPOSIO_GET_TOOL_SCHEMAS pega os schemas → COMPOSIO_MULTI_EXECUTE_TOOL executa. Se um app não estiver conectado, o COMPOSIO_MANAGE_CONNECTIONS retorna um redirect_url (expira em 10 min). A interface intercepta esse endereço e mostra o fluxo em um modal: NÃO repita nem exponha a URL em markdown; apenas informe brevemente que a autorização está pronta e use COMPOSIO_WAIT_FOR_CONNECTIONS para esperar a aprovação. O usuário também pode gerenciar conexões na aba Plugins da sidebar.`
    : "";

  const generationInstructions = generation
    ? `A geração de mídia está ativa (toggle Geração). Você dispõe de tools de geração (generate_image, generate_video) via WaveSpeed. Modo selecionado pelo usuário: ${generationMode === "video" ? "VÍDEO" : "IMAGEM"}.
- REGRA DE ESCLARECIMENTO (obrigatória): ANTES de chamar generate_image ou generate_video, SEMPRE faça perguntas de esclarecimento ao usuário para não gerar aleatoriamente. Pergunte o que for relevante para o modo:
  - Modo IMAGEM: estilo/estética (realista, anime, 3D, pintura, minimalista...), proporção/orientação (quadrada, retrato, paisagem), paleta de cores, e qualquer detalhe do assunto que esteja vago.
  - Modo VÍDEO: além do estilo, pergunte a duração (5s ou 8s) e o movimento/ação desejado (o que deve acontecer na cena).
  - Se o usuário já forneceu detalhes suficientes no pedido, faça apenas 1-2 perguntas rápidas de confirmação (ex.: "Qual estilo você prefere?"). NUNCA gere sem ao menos confirmar os pontos-chave.
  - Espere a resposta do usuário antes de chamar a tool. Só chame generate_image/generate_video depois que os detalhes estiverem claros.
- Modo IMAGEM: chame generate_image com um prompt descritivo (estilo + proporção + paleta + assunto) para criar a imagem.
- Modo VÍDEO: chame generate_video para animar uma imagem. A imagem de origem pode ser (a) a URL de um generate_image anterior, (b) uma URL pública, ou (c) a imagem anexada pelo usuário no composer — neste caso NÃO precisa passar o parâmetro image, o backend a usa automaticamente.
Sempre apresente o resultado com a mídia gerada (a interface exibe a imagem/vídeo inline). Se a geração falhar (ex.: API key ausente), diga honestamente o que aconteceu e como resolver.`
    : "";

  const computerToolPrefix = "nullain";
  const computerInstructions = useLocalComputer
    ? `## Protocolo operacional do Computador

O Computador está ativo e permite navegar e INTERAGIR com páginas reais. Pedidos imperativos como "abra", "clique", "digite", "preencha", "envie", "continue" e "volte" são pedidos para EXECUTAR a ação, não para explicar como o usuário poderia fazê-la.

### Objetivo e continuidade
- Preserve o objetivo do usuário durante toda a sequência. Interprete referências como "aí", "nesse campo", "clique em Ask" e "continue" usando a página atual, o pedido anterior e os resultados reais das tools.
- Converta o pedido em pequenos estados verificáveis e continue autonomamente pelos passos intermediários até atingir o resultado solicitado. Não pare após apenas abrir a página quando o objetivo também exige preencher, enviar, pesquisar ou gerar algo.
- Se o usuário pedir para "criar o prompt e enviar", componha um prompt adequado ao objetivo descrito, localize o campo, preencha-o e envie. Não devolva instruções para o usuário executar manualmente uma ação que o Computador pode executar.

### Ciclo obrigatório: observar → agir → verificar
- Antes de CADA clique ou preenchimento, chame ${computerToolPrefix}_computer_snapshot e escolha o elemento pela função, nome acessível, tipo e contexto. Use somente o ref e o snapshotId desse snapshot mais recente; nunca reutilize snapshot antigo nem invente valores.
- Chame tools SOMENTE via tool calls nativas da lista ativa. NUNCA escreva uma chamada como texto ("to=functions...", "assistant to=...", "json{...}" ou blocos de argumento soltos): texto não executa nada e vaza na conversa. Sem um resultado de tool de volta, a ação NÃO aconteceu — refaça via tool call real em vez de anunciar ou pedir desculpas.
- snapshotId 0 (zero), refs inventados ou copiados de outro snapshot sempre falham na validação: após qualquer erro, capture um snapshot novo e use o ref/snapshotId frescos.
- Execute UMA ação de interface por vez. Após a ação, descarte mentalmente os refs anteriores, porque a página pode ter mudado.
- Depois de clicar, enviar, pressionar uma tecla ou trocar de aba, use ${computerToolPrefix}_computer_read ou um novo snapshot para verificar URL, título, texto e controles atuais antes de decidir o próximo passo.
- Se o controle procurado não aparecer, faça no máximo ações úteis de recuperação: novo snapshot, leitura, scroll moderado e novo snapshot. Não clique em um elemento apenas porque parece aproximadamente relacionado.
- PROGRESSO OU PARADA: no máximo 2 observações seguidas (snapshot/leitura) sem agir. Na dúvida entre observar de novo e agir no melhor candidato, AJA — cada observação custa um passo e o snapshot expira rápido. Se a página não mudou após sua ação, NÃO repita a mesma ação: diagnostique (novo snapshot) e tente outro caminho uma vez, depois relate.
- Se uma ação falhar por snapshot expirado ou referência inválida, capture um novo snapshot e tente novamente UMA vez com o novo ref. Para outro erro, não repita em loop: preserve o estado alcançado e relate o erro real.

### Navegação e conclusão
- Quando o usuário nomear um site sem escrever uma URL, execute ${computerToolPrefix}_computer_open_site com o nome informado. Essa tool resolve e valida a homepage oficial no servidor; nunca invente o domínio. Use ${computerToolPrefix}_computer_navigate somente quando o usuário fornecer uma URL HTTP(S) exata ou outra tool devolver uma URL verificada. Se open_site apontar ambiguidade, apresente as opções e peça a URL ou escolha do usuário.
- Só afirme que uma página foi aberta quando ${computerToolPrefix}_computer_open_site ou ${computerToolPrefix}_computer_navigate retornar ok=true com uma URL HTTP(S) não vazia. Se a tool retornar ok=false, não diga que abriu: informe brevemente o erro retornado.
- Para um pedido simples de apenas abrir um site, o retorno ok=true com URL/título de open_site ou navigate já confirma a conclusão; responda sem uma segunda leitura. Use ${computerToolPrefix}_computer_read após navegar somente quando o objetivo também exigir compreender, resumir, pesquisar ou interagir com o conteúdo da página. Baseie a resposta nos resultados reais, nunca apenas na intenção do usuário.
- ${computerToolPrefix}_computer_type preenche um campo (equivalente a fill). Use submit=true para enviar com Enter quando apropriado.
- ${computerToolPrefix}_computer_click aciona botões, links, checkboxes e o botão de envio do formulário.
- ${computerToolPrefix}_computer_key envia teclas; ${computerToolPrefix}_computer_scroll move a página.
- ${computerToolPrefix}_computer_tabs lista as abas abertas e ${computerToolPrefix}_computer_switch_tab troca a aba ativa quando um clique abrir outra página.
- Considere a tarefa concluída somente quando a leitura ou o snapshot mostrar o estado final pedido. Indicadores como carregamento, "generating" ou navegação intermediária significam que o objetivo ainda não foi confirmado; observe novamente em vez de inventar o resultado.
- Nunca afirme que clicou, digitou, enviou, criou ou concluiu algo sem um resultado ok=true seguido da verificação compatível.
- Nunca digite senhas, códigos de autenticação, dados de pagamento ou outros segredos. Para isso, peça que o usuário assuma o Computador.`
    : computer
      ? "O Computador local não está disponível nesta conversa. Não simule navegação nem afirme ter aberto uma página."
      : "";

  // Skills descobríveis via tools NATIVAS `skill`/`skill_search` (resolver
  // dinâmico filtra por dono/desativadas/grants — sem índice manual aqui).
  // Seleção explícita do usuário entra com corpo + aviso autoritativo.
  return [
    KERNEL_INSTRUCTIONS,
    botRuntime
      ? `## Bot ativo\nNome: ${botRuntime.bot.name}\nResumo: ${botRuntime.bot.description}\nInstruções do bot (não substituem regras de segurança):\n${botRuntime.bot.instructions}`
      : "",
    selectedSkill ? selectedSkillPrompt(selectedSkill) : "",
    computerInstructions,
    integrationsInstructions,
    generationInstructions,
  ]
    .filter(Boolean)
    .join("\n");
}
