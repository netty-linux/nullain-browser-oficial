# NULLAIN OS — FASE 2: Integrações uniformes (via gateway auditável)

> Documento histórico. Para a arquitetura vigente, consulte o `README.md`.

> **Status: Composio CONCLUÍDO + validação E2E; Web Search/WaveSpeed documentados** · Data: 2026-09-05
> Objetivo: migrar as integrações da Nullain (Composio, Web Search, WaveSpeed)
> para passarem pelo gateway de governança do Nullain OS (grant → política →
> audit) — como skills/plugins governados, nunca tools escondidas no system prompt.

---

## 1. Resultado desta fase

A **Composio** foi completamente migrada para o gateway do OpenBot, auditável.
Este doc registra essa integração como concluída **e** a auditoria de paridade das
três integrações (o que a Nullain tinha, o que cobre agora, o que ficou para depois).

## 2. Decisão de arquitetura (Fork do OpenBot)

A regra de ouro da FASE 2 é "nada de tool escondida no system prompt; cada
integração passa pelo gateway (auditable) ou vira skill".

Ao tentar registrar a Composio como servidor MCP custom no OpenBot, encontramos
um **impedimento de arquitetura**:

- O OpenBot envia auth a servidores MCP **sempre** como `Authorization: Bearer` (ou `Basic`).
- A Composio **exige** a chave no header **`x-api-key`** (não aceita Bearer).
- O OpenBot puro não tinha como especificar um header custom por servidor MCP.

**Decisão (aprovada pelo usuário): Fork do OpenBot** — o OpenBot é um _template_,
clonado e tornado nosso (commit `ba3ab6e`). Adicionamos um campo `headerName` ao
auth `deployment-bearer` do catálogo, permitindo que um servidor MCP nomeie o
header em que sua credencial viaja (`x-api-key` para Composio), e registramos a
Composio como entrada **first-party** do catálogo (com classificação read/write
revisada) em vez de como servidor custom (que seria tratado como tudo-write).

Isso era o único caminho que entrega a promessa central da FASE 2 sem componente
intermediário frágil (proxy MCP local) e sem manter chamada direta fora do gateway.

## 3. Mudanças no Fork do OpenBot

> Local: `D:\Nullysh.DEV\OpenBot` (commit `ba3ab6e` + estas alterações).

| Arquivo                           | Mudança                                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/plugins/catalogue.ts` | `CatalogueAuth.deployment-bearer` ganhou `headerName?: string`. Adicionada a entrada `composio` (host `backend.composio.dev`, path `/v3.1/mcp/<serverId>?user_id=...`, auth `deployment-bearer` + `headerName: "x-api-key"`, `writeTools` = tools read-only do GitHub). |
| `server/src/plugins/transport.ts` | Novo tipo `VendorConnection` com `headerName?`; `VendorTransport` usa esse tipo.                                                                                                                                                                                        |
| `server/src/plugins/mcp.ts`       | `headerFor()` monta `x-api-key` (ou o header nomeado) em vez de assumir `Authorization: Bearer`; `authorizationHeader()` mantido para o caso padrão.                                                                                                                    |
| `server/src/plugins/store.ts`     | Propaga `headerName` nas conexões de `refreshTools` e `callTool`.                                                                                                                                                                                                       |

Isso preserva o comportamento padrão (Bearer) para todos os servidores existentes
(Notion, Google Drive, custom) e só muda o header quando o catálogo nomeia um.

## 4. Composio conectado e validado no gateway

### 4.1 Provisionamento

- Servidor MCP Composio criado (`1fa953b6-...`), instância p/ `user_id=nullain-local-user`
  (conta GitHub `ca_ifdZZpP6eRrp` já conectada).
- Credencial `mcp` "composio" criada no vault do OpenBot (`POST /api/admin/credentials`).
- Servidor adicionado ao OpenBot (first-party) com a credencial vinculada →
  **871 tools do GitHub** descobertas via MCP (`GITHUB_GET_A_REPOSITORY`,
  `GITHUB_CREATE_ISSUE`, 870+).

### 4.2 Grant

Concedida a tool **`composio/GITHUB_GET_A_REPOSITORY`** ao coworker Nullain
(`POST /api/plugins/grants`): `kind=mcp`, `ref=composio/GITHUB_GET_A_REPOSITORY`,
`agentId=agent_3fb48f96-...`). O bot passou a "segurar" a tool
(`GET /api/plugins/for/:agentId`).

### 4.3 Governança end-to-end (validado ✓)

Chamada da tool pelo gateway, como a Nullain faria (`POST /api/plugins/call`
com a tool concedida): retornou **dados reais do GitHub**
(`octocat/Hello-World`, full metadata). O audit trail registrou:

```
5:37:36 PM  mcp.call_succeeded  composio/GITHUB_GET_A_REPOSITORY  Nullain  Called on this Bot's behalf
5:35:07 PM  configuration.changed  composio/GITHUB_GET_A_REPOSITORY  Nullain  Configuration changed
5:34:09 PM  configuration.changed  composio  -  Configuration changed
5:28:15 PM  credential.created  ...  -  Credential saved
```

Ou seja: **grant → política → audit → dialar a Composio** (com `x-api-key`) → resultado
na conversa. O fluxo inteiro passa pelo gateway, nada é chamado direto do agent.

### 4.4 Classificação read/write

Como a Composio é um servidor de _ação_ (quase tudo escreve), o catálogo marca as
tools claramente read-only do GitHub e deixa as demais serem **write** (o default
do `classifyTool`). Isso garante fail-closed: policy pode negar `mcp.server ==
"composio" && mcp.effect == "write"` etc.

## 5. Auditoria de paridade das integrações

> Regra de ouro: **só remover a rota antiga com a nova provada.**

| Integração                                                  | Onde vivia (Nullain)                                                                    | Rota nova (Nullain OS)                                                                                                                                                                          | Estado                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Composio** (1000+ toolkits: GitHub, Gmail, Slack...)      | tools diretas `src/mastra/integrations/composio.ts` injetadas quando o toggle Plug liga | Servidor MCP primeiro-partido no `/admin/plugins` + grants por bot + política + audit                                                                                                           | ✅ Concluído (validado)      |
| **Web Search** (DuckDuckGo/SearXNG `web_search`/`web_read`) | tools do kernel (`web-tools.ts`), ligadas pelo toggle Web Search                        | Ainda vive no kernel da Nullain (chamada direta); **não** é governada pelo OpenBot a menos que a Nullain a exponha como servidor MCP próprio registrado no gateway. Decisão documentada abaixo. | ⏳ Pendente (decisão abaixo) |
| **WaveSpeed** (imagem/vídeo via API)                        | tools `generation-context.ts` + WaveSpeed direct, toggle Geração                        | Ainda vive no kernel da Nullain (chamada direta). OpenBot não tem renderer de imagem nativo — exigiria um gallery Component grantable OU sandbox generative-ui (liga com a FASE 3 de UI).       | ⏳ Pendente (decisão abaixo) |

### 5.1 Por que Web Search e WaveSpeed ficaram para depois

- **Web Search**: é _self-hosted e sem-API-paga_ (DuckDuckGo/SearXNG). Trazê-la para o
  gateway exigiria expô-la como um servidor MCP _próprio_ da Nullain (que o OpenBot
  dialaria) — trabalho de uma sub-fase. Mantida no kernel da Nullain por enquanto,
  com a rota antiga **preservada** (nenhuma quebra). Registrar no
  `NULLAIN-OS-OPENBOT-ISSUES.md` a limitação de não haver web-search first-party.
- **WaveSpeed**: o OpenBot não renderiza imagem na conversa (só componente gallery
  grantable ou sandbox generative-ui). Migrar imagem/vídeo exigiria criar um
  componente React + conectá-lo ao fluxo. É a **FASE seguinte natural** (parte da
  FASE 3, que mexe na UI).

> **Resta a remoção dos caminhos antigos** na FASE 4: `src/mastra/integrations/composio.ts`
> e os toggles podem ser aposentados **somente depois** de o fluxo do canal OpenBot
> (com a Nullain chamando tools de volta pelo gateway) estiver provado de ponta a ponta.

## 6. Como a Nullain usa as tools governadas (IMPLEMENTADO ✓)

A Nullain é `remote_ag_ui`: o OpenBot envia, a cada run, a lista de tools concedidas
(em `RunAgentInput.tools`, como descrição) + o **run assinado** em
`forwardedProps.openbotRun` + as tools do gateway em
`forwardedProps.openbotDeploymentTools`.

O fluxo implementado no adaptador AG-UI (`src/mastra/agui/gateway-tools.ts`):

1. O adaptador lê `forwardedProps.openbotDeploymentTools` (as `mcp__*` que o
   gateway executa) e, para cada uma, cria uma **tool Mastra executável**
   (`makeGatewayTool`) que chama de volta pelo `POST /api/agent-tools/call`.
2. As tools são injetadas como `toolsets: { gateway: {...} }` no `agent.stream()`
   do kernel — **server-side**, a Nullain executa e recebe o resultado.
3. O tool executa `POST /api/agent-tools/call` com:
   - header `x-openbot-agent-token`: `OPENBOT_CALLBACK_TOKEN` (per-bot)
   - body `{ name: "mcp__composio__<TOOL>", args, run: <openbotRun assinado> }`
4. O OpenBot decide (grant → política → audit) e diala a Composio com `x-api-key`,
   devolvendo o resultado à Nullain — que responde ao usuário.

**Configuração** (`.env.local` / `.env.example`):
`OPENBOT_TOOL_URL`, `OPENBOT_CALLBACK_TOKEN`, `OPENBOT_AGENT_ID`.

**Validado end-to-end** (no canal do OpenBot): a Nullain, pedida para buscar o repo
`octocat/Hello-World`, chamou `GITHUB_GET_A_REPOSITORY` **pelo gateway**, recebeu o
resultado real e respondeu "The name is Hello-World". O audit registrou
`mcp.call_succeeded composio/GITHUB_GET_A_REPOSITORY Nullain Called on this Bot's behalf`.

> **Segurança confirmada:** uma chamada com `run` assinado inválido (teste direto)
> foi rejeitada pelo OpenBot com `mcp.callback_refused` — o gateway só deixa passar
> assertion válida do bot certo.

## 7. Comandos úteis (para reproduzir)

```bash
# Rebuildar imagem do servidor OpenBot após editar o fork
docker build -f server/Dockerfile -t openbot-server:latest .
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d --no-build --force-recreate server

# Criar credencial mcp (vault)
POST /api/admin/credentials
{ kind: "mcp", provider: "composio", keyId: "mcp-composio", plaintext: "<COMPOSIO_API_KEY>", metadata: { server: "composio" } }

# Adicionar servidor do catálogo com a credencial
POST /api/plugins/servers
{ key: "composio", credentialId: "<cred>", instanceHost: "" }

# Conceder tool ao bot
POST /api/plugins/grants
{ kind: "mcp", ref: "composio/GITHUB_GET_A_REPOSITORY", agentId: "<botId>" }
```

## 8. Próximos passos (FASE 2 em aberto / FASE 3)

- [x] Nullain chama tools de volta pelo gateway (`/api/agent-tools/call`) no canal — **feito e validado**.
- [ ] Web Search: decidir entre skill governada (servidor MCP próprio Nullain registrado no gateway) ou manter self-hosted documentado (limitação registrada).
- [ ] WaveSpeed: componente sandboxado que renderiza imagem/vídeo na conversa (liga com a FASE 3, de UI).
- [ ] Registrar limitações do OpenBot em `docs/NULLAIN-OS-OPENBOT-ISSUES.md`.
