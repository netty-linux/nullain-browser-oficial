# NULLAIN OS — FASE 0: Laboratório (OpenBot puro)

> Documento histórico. Para a arquitetura vigente, consulte o `README.md`.

> **Status: CONCLUÍDA** · Data: 2026-09-05
> Objetivo: colocar o OpenBot puro em pé, sem tocar na Nullain Agent, e validar
> que a fundação (gateway, supervisor, computer, UI, audit, política) funciona.

---

## 1. Contexto e premissa

OpenBot é um _template, não um produto_ — clonar e tornar nosso. É alpha (v0.0.7),
espere _rough edges_. Nesta fase o OpenBot roda **puro**: nenhuma alteração de código
é feita nele nem na Nullain. O entregável é um ambiente verificado + este documento.

## 2. Localização e commit pinado

| Item             | Valor                                      |
| ---------------- | ------------------------------------------ |
| Repositório      | https://github.com/CopilotKit/openbot      |
| Diretório irmão  | `D:\Nullysh.DEV\OpenBot`                   |
| Commit pinado    | `ba3ab6e4aa97d015264dbdc891654a7f449c6517` |
| Abreviação       | `ba3ab6e` (2026-09-04)                     |
| Tag mais próxima | `v0.0.7` (não usada; HEAD já ultrapassou)  |

> **MOTIVO DO PIN:** OpenBot é alpha e muda rápido. Todo o trabalho das fases
> seguintes (adaptador AG-UI etc.) será feito contra **este** commit. Qualquer
> atualização de versão é uma decisão consciente documentada.

## 3. Ambiente da máquina (verificado)

| Ferramenta     | Versão            | Status                                |
| -------------- | ----------------- | ------------------------------------- |
| Windows        | (11)              | OK                                    |
| Git            | 2.54.0.windows.1  | OK                                    |
| Docker Desktop | 29.7.2            | OK (daemon ativo)                     |
| Docker Compose | v5.5.0            | OK                                    |
| Bun            | 1.3.14            | OK (bate com `packageManager` pinado) |
| Node           | v24.13.1          | OK                                    |
| Bash           | 5.2.21 (Git Bash) | OK                                    |

**Observação OpenSSL no Windows:** `openssl` não está no PATH do Windows. O
`prompt.txt` pede `openssl rand -base64 32` para gerar a `KEY_ENCRYPTION_KEY`.
No Windows usei o PowerShell equivalente (32 bytes aleatórios → Base64 → validado
como 32 bytes decodificados). **Decisão documentada** para as demais chaves.

## 4. Configuração (`.env`)

O OpenBot já estava clonado com `.env` preenchido. Estado revisado:

| Variável               | Estado                       | Comentário                                                             |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `INTELLIGENCE_API_KEY` | ✅ presente                  | chave `cpk-...` do CopilotKit Intelligence (free tier)                 |
| `OPENAI_API_KEY`       | ✅ presente                  | credencial do modelo                                                   |
| `OPENAI_BASE_URL`      | ✅ `https://ollama.com/v1`   | **aponta pro Ollama Cloud** (endpoint OpenAI-compatível)               |
| `BOT_MODEL`            | ✅ `glm-5.3-flash:cloud`     | modelo da framework Bot                                                |
| `KEY_ENCRYPTION_KEY`   | 🔄 **regenerada nesta fase** | substituí a chave pública de exemplo por uma privada (32 bytes base64) |
| `PORT`/`SERVER_PORT`   | ✅ `3001`                    | API                                                                    |
| `APP_PORT`             | ✅ `3010`                    | UI (default)                                                           |
| `MANAGED_AGENT_TOKEN`  | ✅ presente                  | gerado por `scripts/start.sh`                                          |
| `AGENT_TOOL_TOKEN`     | ✅ presente                  | gerado por `scripts/start.sh`                                          |
| `OPENBOT_SINGLE_USER`  | ✅ `true`                    | modo dev de admin único (nunca expor na rede)                          |

> **Modelo apontado para Ollama Cloud:** o OpenBot espera `OPENAI_API_KEY`.
> Como a Nullain usa Ollama Cloud (endpoints OpenAI-compatíveis), configuramos
> `OPENAI_BASE_URL=https://ollama.com/v1` + `BOT_MODEL` com um modelo `:cloud`.
> Isso será a base de todo o restante do projeto. _(ver `.env.example` do repositório)_

As únicas 3 chaves que o `start.sh` não inventa:

1. `INTELLIGENCE_API_KEY` ✅ (já presente)
2. `OPENAI_API_KEY` ✅ (já presente, apontando para Ollama)
3. `KEY_ENCRYPTION_KEY` 🔄 (regenerada)

## 5. Instalação e inicialização

### 5.1 Dependências

```bash
cd D:\Nullysh.DEV\OpenBot
bun install
# Resultado: Checked 1143 installs across 1272 packages (no changes) — tudo em dia
```

### 5.2 Config da app (obrigatória antes da UI)

```bash
bun run generate:app-config
```

### 5.3 Subir serviços (Docker)

No Windows usamos Compose com o overlay específico da plataforma (não o
`scripts/start.sh` bash, que é a via Unix):

```bash
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d --no-build \
  postgres supervisor agent-computer agent-bot agent-langgraph server
```

### 5.4 Subir a UI (processo Bun, fora do Docker)

A UI (app Vite) roda como processo host, fora do Docker:

```bash
cd app
bun run dev --port 3010 --strictPort
```

> **Nota Windows (importante):** o Vite faz _bind em IPv6 `::1`_ apenas. O acesso
> funciona via `http://localhost:3010` (o SO resolve para `::1`). O cold-start do
> Vite demora ~19s na primeira visita; esperar antes de julgar "quebrado".

## 6. Health checks (resultado)

```bash
# API (3001):
curl http://localhost:3001/api/capabilities
# => {"mode":"intelligence","durableHistory":true,"generativeUi":false,...}

# Containers:
docker ps
# openbot-postgres-1          (healthy)
# openbot-supervisor-1        (healthy)
# openbot-agent-computer-1    (healthy)
# openbot-agent-bot-1         (healthy)
# openbot-agent-langgraph-1   (healthy)
# openbot-server-1            (healthy)

# UI / rotas (3010) — todas HTTP 200 após cold-start:
#   /bot | /agents | /admin/audit | /admin/boundaries
```

## 7. Testes de fumaça (executados ✅)

### 7.1 Chat com computador — `/bot`

Enviei: _"Open news.ycombinator.com and tell me the top story"_.

O **Survival Bot** (bot do tenant package de exemplo) abriu o navegador próprio,
navegou para `news.ycombinator.com`, leu a front page e respondeu:

> _"The top story (position #1) is: 'The Luxuries in Life' (feld.com), 108 points,
> submitted by tosh, 1 hour ago, with 37 comments so far."_

Confirma o fluxo **computer-per-bot** (container + browser + tool call) e streaming.

### 7.2 Audit trail — `/admin/audit`

A ação acima apareceu em `/admin/audit`:

| Quando     | O quê                     | Onde                 | Bot          | Decisão               |
| ---------- | ------------------------- | -------------------- | ------------ | --------------------- |
| 4:42:44 PM | navigate                  | news.ycombinator.com | Survival Bot | **Allowed**           |
| 4:37:11 PM | computer.isolation_loaded | —                    | —            | Isolation at start-up |
| 4:37:11 PM | computer.policy_loaded    | —                    | —            | Boundary at start-up  |

Audit legível, com colunas When/What/On/Bot/Decision. ✅

### 7.3 Política deny → refusal — `/admin/boundaries`

Criei a regra CEL no painel `It may never`:

```text
page.host == "news.ycombinator.com"
```

(Enforce / "Stop the action" — deny avaliado antes de allow.)

Pedí ao bot novamente _"Open news.ycombinator.com again"_. O bot tentou navegar,
**foi recusado** e respondeu:

> _"I tried to open it again, but this time the action was blocked by this
> deployment's policy — the rule explicitly disallows navigating to
> news.ycombinator.com."_

O audit registrou o refusal **com a regra que bloqueou**:

| Quando     | O quê    | Onde                 | Bot          | Decisão     | Regra                                 |
| ---------- | -------- | -------------------- | ------------ | ----------- | ------------------------------------- |
| 4:43:37 PM | navigate | news.ycombinator.com | Survival Bot | **Blocked** | `page.host == "news.ycombinator.com"` |

Confirma: **fail-closed, deny-antes-de-allow, refusal gravado com a regra visível.** ✅

_Após o teste a regra foi removida, restaurando o ambiente limpo._

## 8. Problemas encontrados e decisões

| #   | Problema                                                             | Decisão / Workaround                                                                                                                                        | Doc      |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `openssl` ausente no PATH do Windows                                 | Gerar 32 bytes via PowerShell (equivalente a `openssl rand -base64 32`), validar decode = 32 bytes                                                          | este doc |
| 2   | Vite/UI bind em IPv6 `::1` apenas                                    | Usar `http://localhost:3010` (resolve p/ `::1`). Evitar `[::1]` explícito em ferramentas de browser                                                         | este doc |
| 3   | Cold-start do Vite ~19s parece "quebrado"                            | Aguardar antes de diagnosticar timeout de navegação                                                                                                         | este doc |
| 4   | PowerShell trata stderr do `bun`/`docker compose` como erro (exit 1) | Não é falha real; checar saída real e `$LASTEXITCODE` quando disponível                                                                                     | este doc |
| 5   | Portas já ocupadas                                                   | Detectar com `Get-NetTCPConnection` antes de subir; ajustar `APP_PORT`/`SERVER_PORT`                                                                        | —        |
| 6   | `.env` já existia com chaves do dev anterior                         | **Segurança:** regenerar segredos que não precisavam ser os do dono original (KEY_ENCRYPTION_KEY regenerada; tokens MANAGED/AGENT regenerados via start.sh) | este doc |

Bugs/limitações do próprio OpenBot (alpha) que encontrarmos nas próximas fases
devem ser registrados em **`docs/NULLAIN-OS-OPENBOT-ISSUES.md`**.

## 9. Decisões de arquitetura (base para Fase 1+)

1. **Base = OpenBot em `D:\Nullysh.DEV\OpenBot`, commit `ba3ab6e`.**
2. **Modelo via Ollama Cloud** com `OPENAI_BASE_URL=https://ollama.com/v1` —
   nenhuma dependência paga além do CopilotKit Intelligence free tier.
3. **1 único container de computador** (restrição da máquina, 16GB RAM) → por
   enquanto, sem `COMPUTER_SUPERVISOR_URL` (todos os bots compartilham o computer
   em `http://localhost:4100`). Sem gVisor (`COMPUTER_RUNTIME` vazio).
4. **UI herdada do OpenBot** nesta fase; a cara Nullain (Bloub, dark mode) será
   aplicada na Fase 3, sem substituir o template cru.
5. **Gateway de governança, supervisor, audit e política CEL** já ativos e
   verificados — são a espinha dorsal do Nullain OS.

## 10. Como rodar / parar (resumo)

**Subir:**

1. `docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d --no-build postgres supervisor agent-computer agent-bot agent-langgraph server`
2. `bun run generate:app-config` (no diretório raiz do OpenBot)
3. `cd app && bun run dev --port 3010 --strictPort`

**Abrir:** http://localhost:3001 (API) · http://localhost:3010 (UI)

**Parar:** `docker compose -f docker-compose.yml -f docker-compose.windows.yml down`
(+ matar o processo Bun da UI na porta 3010).

---

## Próxima fase (Fase 1 — Nullain vira coworker via AG-UI)

- Criar adaptador AG-UI sobre a API Mastra da Nullain (`/api/ag-ui/[agent]`).
- Expor os 5 agentes (chat, coding, kernel, research, synthesis).
- Registrar a Nullain como coworker em `/agents` (remote-ag-ui + endpoint).
- Configurar `AGENT_ENDPOINT_ALLOWED_HOSTS` com o host local da Nullain.
- Validar chat dentro do canal OpenBot + streaming + threads persistidas.
