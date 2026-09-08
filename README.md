# Nullain Agent

Assistente open source construído com Mastra, Ollama Cloud, Next.js e assistant-ui.

<img width="1917" height="914" alt="image" src="https://github.com/user-attachments/assets/549eff33-eeb9-47a8-8482-9f7925940520" />

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/ad3a5543-96d9-4884-aea5-d702ed5b380b" />

<img width="1919" height="917" alt="image" src="https://github.com/user-attachments/assets/a609f1c6-3c15-40d5-a2eb-fcaaf4a335fc" />


## Recursos

- Kernel supervisor com processos especializados de pesquisa, código e síntese.
- Pesquisa pela web exclusivamente pelo Computador/OpenBot, controlada pelo usuário.
- Memória persistente em LibSQL por conversa.
- Skills com carregamento progressivo e suporte a upload de pacotes.
- Plugins via Composio MCP.
- Geração de imagem e vídeo via WaveSpeed.
- Streaming de resposta, raciocínio e tool calls na interface.
- Nullain Code local com projetos isolados, aprovação de plano e autenticação própria.

## Requisitos

- Node.js 20 ou superior.
- Chave da Ollama Cloud.
- OpenBot em `http://localhost:3001` para recursos do Computador.

Copie `.env.example` para `.env.local`, preencha as variáveis necessárias e execute:

```bash
npm install
npm run dev
```

A interface fica disponível em `http://localhost:3000`.

## Arquitetura

```text
Usuário → /api/chat → kernelAgent
                         ├─ researchAgent → Computador/OpenBot
                         ├─ codingAgent
                         └─ synthesisAgent
```

- `app/api/chat/route.ts`: validação, configuração por requisição e streaming.
- `src/mastra/agents/kernel-agent.ts`: supervisor, memória e políticas de delegação.
- `src/mastra/agents/*-agent.ts`: processos especializados.
- `src/mastra/tools`: skills, Computador e geração de mídia.
- `app/api/computers`: proxy restrito para o Computador do OpenBot.
- `app/api/ag-ui`: integração autenticada com clientes AG-UI.

O `chatAgent` permanece registrado somente para compatibilidade com clientes legados.

## Nullain Code

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
