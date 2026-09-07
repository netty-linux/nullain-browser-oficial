# Changelog

## Em desenvolvimento — 2026-09-06

### Arquitetura

- Consolidado o fluxo principal em `kernelAgent` com delegação para pesquisa,
  código e síntese.
- Removidos Meta-Agent, intent-router e acesso legado à web por SearXNG.
- Mantido `chatAgent` apenas para compatibilidade com clientes existentes.
- Unificado o sistema de skills no loader dinâmico usado pela interface e pelo
  kernel.

### Correções

- Isolados por requisição o toggle do Computador, as skills desativadas e a
  imagem usada na geração de vídeo.
- Preservadas as instruções do kernel quando Plugins ou Geração estão ativos.
- Restaurado o índice de skills no prompt principal.
- Implementada a visualização ampliada da tela do Computador.
- Removida a dependência de fontes remotas no build.
- researchAgent volta a receber as ferramentas do Computador (navigate,
  snapshot, read, click, type, key, scroll) quando delegado pelo kernel: a
  delegação do @mastra/core 1.64 não repassa o `clientTools` do route ao
  sub-agente (o provider recebia zero tools). Correção via `defaultOptions`
  no researchAgent (2026-09-07); o toggle Computador continua governando a
  delegação em código. No canal coworker (AG-UI), as tools do Computador
  seguem vindo do anúncio do gateway do OpenBot, agora com log de observação
  do conjunto anunciado.
- Adaptador AG-UI volta a reportar tool calls ao OpenBot: o handler antigo
  (`tool-start`) mapeava um chunk type que deixou de existir no
  @mastra/core 1.64 — nenhum TOOL_CALL_* chegava ao consumidor e as args iam
  sempre vazias. Agora mapeia os types reais (`tool-call-input-streaming-start`,
  `tool-call-delta`, `tool-call`, `tool-result`) com args íntegros e
  TOOL_CALL_RESULT para tools server-executadas (2026-09-07).

### Segurança

- Adicionados limites de payload e validação de modelo/esforço na rota de chat.
- Restringidos os proxies do OpenBot a métodos e caminhos realmente usados.
- Adicionada proteção de origem para mutações e limites de upload.
- Removida a escrita de skills acionável pelo modelo; criação agora exige upload explícito.
- Endurecida a extração de ZIP contra zip slip e zip bombs antes da descompressão.
- Tornada obrigatória a configuração de token para o endpoint AG-UI.
- Adicionados headers defensivos de navegador.

### Remoções

- `src/mastra/tools/web-tools.ts` e dependências de parsing HTML.
- Implementação duplicada de skills nativas.
- Seletores antigos de integrações e geração substituídos pelo menu atual.
- Tool de aprovação simulada que sempre negava e não possuía fluxo de retomada.
