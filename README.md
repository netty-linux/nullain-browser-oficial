# Nullain Agent

Assistente open source construído com Mastra, Ollama Cloud, Next.js e assistant-ui.

<img width="1917" height="914" alt="image" src="https://github.com/user-attachments/assets/549eff33-eeb9-47a8-8482-9f7925940520" />

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/ad3a5543-96d9-4884-aea5-d702ed5b380b" />

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/a609f1c6-3c15-40d5-a2eb-fcaaf4a335fc" />

<img width="1916" height="908" alt="image" src="https://github.com/user-attachments/assets/0de129ea-126a-4614-8bcc-9af2266ba27a" />

<img width="1913" height="905" alt="image" src="https://github.com/user-attachments/assets/f1e01655-bb5f-4936-b2cf-13a63399507d" />

<img width="1919" height="908" alt="image" src="https://github.com/user-attachments/assets/761f2aa7-2057-400b-8b67-f2c3c15064b6" />

<img width="1916" height="907" alt="image" src="https://github.com/user-attachments/assets/cd605ad0-f22c-423b-b522-a53c702cf002" />


## Recursos

- Kernel supervisor com processos especializados de código e síntese, além de navegação web pelo Computador local.
- Bot Runtime persistente: a experiência começa somente com a Nullain e novos bots são criados por conversa.
- Conversas e transcripts isolados por usuário e bot, com reload, paginação e retomada segura de execução.
- Pesquisa pela web exclusivamente pelo Computador local isolado, controlada pelo usuário.
- Memória persistente em LibSQL por conversa.
- Biblioteca de Skills com nativas protegidas, catálogo privado por conta e seleção por `/` no chat.
- Plugins via Composio MCP.
- Geração de imagem e vídeo via WaveSpeed.
- Streaming de resposta, raciocínio e tool calls na interface.
- Nullain Code local com projetos isolados, aprovação de plano e autenticação própria.

## Requisitos

- Node.js 20 ou superior.
- Chave da Ollama Cloud.
- Docker Desktop ou Docker Engine para o Computador local (`npm run computer:up`).

Copie `.env.example` para `.env.local`, preencha as variáveis necessárias e execute:

```bash
npm install
npm run dev
```

A interface fica disponível em `http://localhost:3000`.

## Arquitetura

```text
Usuário → /api/chat → kernelAgent
                         ├─ pesquisa direta → Computador local escopado por conversa
                         ├─ codingAgent
                         └─ synthesisAgent
```

- `app/api/chat/route.ts`: validação, configuração por requisição e streaming.
- `src/mastra/agents/kernel-agent.ts`: supervisor, memória e políticas de delegação.
- `src/mastra/agents/*-agent.ts`: processos especializados.
- `src/mastra/tools`: skills, Computador e geração de mídia.
- `app/api/bots/[id]/conversations/[conversationId]/computer`: API autenticada do Computador local.
- `app/api/ag-ui`: integração autenticada com clientes AG-UI.

O `chatAgent` permanece registrado somente para compatibilidade com clientes legados.

## Bot Runtime e conversas persistentes

A Nullain é o único bot criado por padrão. Bots adicionais nascem por uma entrevista progressiva
no próprio chat: objetivo, instruções, modelo e capacidades são revisados em cartões persistentes
antes da confirmação. Todos usam a marca oficial da Nullain como avatar, com uma cor estável por
bot nas listas, cabeçalhos, autoria e telas de revisão.

O SQLite da aplicação é a fonte canônica do transcript visual. Mensagens do usuário são gravadas
antes da execução; mensagens do assistant e seus estados são controlados apenas pelo servidor.
Cada envio possui idempotência, um único run associado e transições protegidas para conclusão,
falha, cancelamento ou interrupção. Recarregar a página restaura mensagens, partes estruturadas e
execuções sem iniciar outro run ou duplicar o contexto entregue ao Mastra.

As APIs autenticadas validam propriedade por usuário, bot e conversa. O navegador não escolhe
papéis privilegiados, status finais, owner, namespace de memória ou tokens de claim. Tipos de parte
estruturada são versionados e validados, e o chat legado continua no fluxo compatível existente.

## Computador local

O toggle **Computador** disponibiliza ao kernel um Chromium real executado localmente em Docker.
Cada sessão é derivada no servidor por usuário, bot e conversa; esses identificadores não são
aceitos como autoridade a partir do navegador. O runtime bloqueia redes locais/privadas, downloads
automáticos e service workers, exige entrega explícita de controle para entrada humana e restaura a
aba ativa depois de reinícios do processo web enquanto o container continuar vivo.

O mesmo compose inicia um SearXNG privado em `127.0.0.1:8088`. A tool
`nullain_computer_open_site` usa esse serviço para transformar nomes humanos em homepages oficiais,
valida DNS e HTTPS no servidor, recusa resultados ambíguos e guarda resoluções confiáveis por 30 dias
no SQLite. `nullain_computer_navigate` continua reservado para URLs exatas e verificadas.

```bash
npm run computer:up
npm run computer:status
npm run computer:down
```

Os serviços escutam somente em `127.0.0.1`. Nenhum diretório do Windows, Docker socket ou credencial
do host é montado nos containers. Para permitir deliberadamente uma intranet de desenvolvimento,
use `NULLAIN_LOCAL_COMPUTER_ALLOW_PRIVATE_NETWORK=1`; o padrão é falhar fechado. O computador local
é um navegador isolado, não um terminal nem acesso ao filesystem do Windows. O endpoint do resolvedor
pode ser substituído com `NULLAIN_SEARXNG_URL`.

### Monitor ao vivo e confiabilidade

O painel lateral exibe a página atual do Chromium com atualização de baixa latência, mantendo o
chat compacto. O estado é escopado pela conversa e a troca de bot ou conversa cancela listeners
anteriores, impedindo que uma resposta atrasada ou uma tela antiga apareça no lugar errado.

A navegação distingue o sucesso da ação de falhas posteriores de observação: uma página que abriu
não é reportada como falha apenas porque uma captura auxiliar atrasou. Capturas são deduplicadas,
o cache usa JPEG limitado e conexões CDP, contextos remotos e reconexões possuem limites explícitos
para evitar loops, vazamentos e crescimento indefinido de memória. A abertura simples usa o evento
de commit e uma leitura leve de URL/título, reduzindo a latência sem mascarar erros reais.

Nomes de sites informados em linguagem natural são resolvidos localmente pelo SearXNG, sem uma
lista manual de domínios. O backend seleciona e valida a homepage oficial, aplica as políticas de
rede e HTTPS e reutiliza resultados confiáveis do cache. Chamadas vazias ou parâmetros inválidos
são reparados somente quando a intenção pode ser derivada com segurança da mensagem do usuário;
casos ambíguos falham de forma explícita em vez de inventar uma URL.

## Skills

A página `/skills` reúne skills nativas e skills importadas pela conta autenticada.
Skills nativas são versionadas com a aplicação e não podem ser editadas, substituídas
ou excluídas. Skills do usuário ficam isoladas por conta em `skills/user-scoped/` e
entram desativadas por padrão. O estado ativado/desativado é uma preferência local
salva no navegador e passa a valer no próximo envio.

O loader segue a especificação aberta [Agent Skills](https://agentskills.io/specification):
cada habilidade é uma pasta cujo `SKILL.md` possui frontmatter YAML com `name` e
`description`, além dos campos opcionais `license`, `compatibility`, `metadata` e
`allowed-tools`. O identificador deve coincidir com o nome da pasta. Metadados visuais
da Nullain usam `metadata.nullain-display-name` e `metadata.nullain-summary`, sem criar
campos proprietários no nível raiz. A descoberta também inclui `.agents/skills/`.

No composer do chat, digite `/` no início da mensagem para abrir o seletor. A busca
considera identificador, nome amigável e resumo. A seleção vira um chip removível,
vale somente para aquela mensagem e é enviada como metadado estruturado; o servidor
confirma novamente que a skill existe, pertence à conta e está ativa antes de
injetar suas instruções.

A skill nativa `skill-creator` permite criar uma habilidade reutilizável a partir de
um pedido explícito no chat. Durante esse fluxo, duas ferramentas de consulta do MCP
oficial do Agent Skills ficam disponíveis para pesquisar a documentação; o MCP é
somente leitura e não substitui a validação local. A criação exige sessão autenticada,
valida a especificação, nunca substitui skills existentes, não executa scripts enviados
e registra a nova skill desativada. Também é possível importar `.md`, `.markdown` ou
`.zip`; o YAML e os recursos válidos do pacote são preservados, enquanto pacotes
inválidos, inseguros ou duplicados são recusados.

## Nullain Code

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/4f235648-47a6-4ef9-b397-0da7f5d31910" />

O recurso em `/code` é um ambiente local de engenharia de software com identidade
própria, projetos isolados por usuário, conversas persistentes e aprovação humana
obrigatória antes de qualquer alteração no projeto. O agente não recebe terminal,
subprocessos, navegador, rede ou acesso fora do workspace selecionado.

### Configuração

Defina em `.env.local` as variáveis documentadas em `.env.example`:

- `NULLAIN_AUTH_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `NULLAIN_APP_DB_PATH`: caminho absoluto do banco próprio da aplicação.
- `NULLAIN_WORKSPACE_ROOT`: pasta absoluta onde os projetos serão gravados.
- `NULLAIN_AUTH_BASE_URL`: origem pública da aplicação.
- `NULLAIN_AUTH_TRUSTED_ORIGINS`: lista de origens autorizadas, separadas por vírgula.
- `MASTRA_MODEL_NULLAIN_CODE`: modelo usado pelo agente de código.

O banco não pode ficar dentro do workspace do agente. No Windows, prefira uma pasta
dedicada em um disco com espaço suficiente, por exemplo
`D:\Nullain-Code-Workspace`.

As migrations nunca são executadas automaticamente no boot. Prepare o banco e crie
o primeiro usuário pelo terminal antes de iniciar o servidor:

```bash
npm run db:migrate
npm run auth:create-user -- --email=voce@exemplo.com --name="Seu nome"
npm run dev
```

A senha é solicitada sem eco no terminal e nunca deve ser passada como argumento.
O cadastro público pela web permanece desabilitado.

### Uso rápido

1. Acesse `/code` e faça login.
2. Crie ou selecione um projeto.
3. Crie uma conversa e descreva a tarefa.
4. Responda às perguntas de esclarecimento apresentadas pelo agente.
5. Revise o plano gerado em `.mastracode/plans`.
6. Aprove para liberar escrita somente naquela execução, ou recuse para pedir uma
   revisão.
7. Abra a pasta física do projeto em seu editor para executar builds e testes.

Uma nova conversa no mesmo projeto reutiliza os arquivos, mas mantém histórico
independente. Aprovações são idempotentes e vinculadas à execução e à sessão
autenticada. Desconectar o SSE não encerra a sessão; logout ou revogação aborta as
execuções associadas.

### Persistência

- Os arquivos de código ficam no disco, abaixo de `NULLAIN_WORKSPACE_ROOT`, em uma
  pasta UUID por projeto. Eles não são armazenados no SQLite.
- `NULLAIN_APP_DB_PATH` guarda usuários, sessões, propriedade dos projetos,
  conversas, execuções e decisões.
- `NULLAIN_DB_URL` (por padrão `file:mastra.db`) guarda mensagens e memória do
  Mastra.

Ao analisar um arquivo, o conteúdo necessário pode ser enviado ao provedor do
modelo configurado. Não coloque credenciais ou chaves privadas no workspace.

### Administração e recuperação

Para redefinir uma senha local e revogar as demais sessões do usuário:

```bash
npm run auth:reset-password -- --email=voce@exemplo.com
```

Antes de atualizar ou fazer backup, pare o processo e copie o arquivo indicado por
`NULLAIN_APP_DB_PATH`, `mastra.db` e seus respectivos arquivos `-wal` e `-shm`, se
existirem. Para restaurar, mantenha o processo parado, substitua os arquivos pelo
backup e só então reinicie. As migrations são aditivas e versionadas em
`db/migrations`.

Perfil de segurança inicial: processo único e duradouro no Windows, acesso apenas
a arquivos do projeto, sem terminal, subprocessos, browser ou rede. O isolamento
contra outro processo hostil executando simultaneamente na mesma conta do Windows
é melhor esforço; links são rejeitados e gravações são atômicas com verificação de
hash, mas a plataforma não oferece uma fronteira de sandbox nativa nesse perfil.

## Scripts

```bash
npm run dev       # desenvolvimento
npm run build     # build de produção
npm run test      # testes automatizados
npm run lint      # lint e formatação
npm run lint:fix  # correções automáticas
npm run db:migrate # migra explicitamente o banco do Nullain Code
```

## Qualidade e compatibilidade

A suíte cobre migrations aditivas, repositories, autenticação e ownership, lifecycle concorrente
de runs, transcript e reload, entrevista de bots, Skills, Nullain Code, transformação de streaming,
reparo de tool calls, resolução de sites e Computador local. O projeto também é verificado com
TypeScript sem emissão, lint/formatter e build de produção do Next.js.

As mudanças preservam os fluxos existentes de chat, Code, Skills, Plugins e autenticação. O
Computador não amplia o acesso ao filesystem do Windows e os serviços locais permanecem vinculados
ao loopback.

## Licença

MIT © Nullain
