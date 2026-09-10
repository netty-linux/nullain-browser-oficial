# Nullain Agent

Assistente open source construído com Mastra, Ollama Cloud, Next.js e assistant-ui.

<img width="1917" height="914" alt="image" src="https://github.com/user-attachments/assets/549eff33-eeb9-47a8-8482-9f7925940520" />

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/ad3a5543-96d9-4884-aea5-d702ed5b380b" />

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/a609f1c6-3c15-40d5-a2eb-fcaaf4a335fc" />

<img width="1916" height="908" alt="image" src="https://github.com/user-attachments/assets/0de129ea-126a-4614-8bcc-9af2266ba27a" />

<img width="1913" height="905" alt="image" src="https://github.com/user-attachments/assets/f1e01655-bb5f-4936-b2cf-13a63399507d" />

<img width="1919" height="908" alt="image" src="https://github.com/user-attachments/assets/761f2aa7-2057-400b-8b67-f2c3c15064b6" />


## Recursos

- Kernel supervisor com processos especializados de pesquisa, código e síntese.
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

## Computador local

O toggle **Computador** disponibiliza ao kernel um Chromium real executado localmente em Docker.
Cada sessão é derivada no servidor por usuário, bot e conversa; esses identificadores não são
aceitos como autoridade a partir do navegador. O runtime bloqueia redes locais/privadas, downloads
automáticos e service workers, exige entrega explícita de controle para entrada humana e restaura a
aba ativa depois de reinícios do processo web enquanto o container continuar vivo.

```bash
npm run computer:up
npm run computer:status
npm run computer:down
```

A imagem do container está fixada por digest e escuta somente em `127.0.0.1`. Nenhum diretório do
Windows, Docker socket ou credencial do host é montado no container. Para permitir deliberadamente
uma intranet de desenvolvimento, use `NULLAIN_LOCAL_COMPUTER_ALLOW_PRIVATE_NETWORK=1`; o padrão é
falhar fechado. O computador local é um navegador isolado, não um terminal nem acesso ao filesystem
do Windows.

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

## Licença

MIT © Nullain
