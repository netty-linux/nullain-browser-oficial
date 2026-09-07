# NULLAIN OS — FASE 4: Consolidação (remoção de dead code)

> Documento histórico. Para a arquitetura vigente, consulte o `README.md`.

> **Objetivo**: remover as rotas e workflows órfãos do Nullain, que ficaram sem função após a migração para o OpenBot — mantendo o princípio "_enxerto, não cirurgia_" e o critério "_só remover o que tem caminho de substituição provado_".
> **Filosofia**: nada foi removido sem ter zero consumidores ativos comprovado. A interface Nullain conservada (`/api/chat`, `/api/skills`, `/api/integrations` e o adaptador AG-UI) permanece intacta.
> **Status**: ✅ completo · build de produção OK · 16 testes OK · endpoints validados ao vivo.

---

## 1. Critério da FASE 4

A restrição nº 3 (preservar a UI Nullain existente) dita que **só se remove código órfão**: rotas que nenhum consumidor ativo chama mais. Mapeamos exaustivamente (subagente de exploração + leitura direta) e confirmamos o verdict por rota.

| Mapa de consumo               | Consumidor frontend                            | `src/mastra`             | `test/` | Veredito |
| ----------------------------- | ---------------------------------------------- | ------------------------ | ------- | -------- |
| `POST /api/approval`          | ❌                                             | ❌ (só workflow interno) | ❌      | **Órfã** |
| `GET/POST /api/meta/agents`   | ❌                                             | ❌                       | ❌      | **Órfã** |
| `POST /api/meta/build`        | ❌                                             | ❌                       | ❌      | **Órfã** |
| `POST /api/meta/build/resume` | ❌                                             | ❌                       | ❌      | **Órfã** |
| `POST /api/chat`              | ✅ (`assistant.tsx:79`)                        | —                        | —       | **Viva** |
| `/api/skills` + `[name]`      | ✅ (`skills-panel.tsx:25,48,65`)               | —                        | —       | **Viva** |
| `/api/integrations`           | ✅ (`integrations-selector.tsx:57,98,133,154`) | —                        | —       | **Viva** |
| `POST /api/ag-ui/[agent]`     | ✅ (OpenBot coworker)                          | —                        | —       | **Viva** |

> Observação: `components/assistant-ui/tool-fallback.tsx` usa `approval`/`respondToApproval`, mas isso é a **UI nativa de aprovação do protocolo de streaming do assistant-ui** — não é `fetch` para `/api/approval`. Nenhuma conexão com a rota HTTP.

---

## 2. O que foi removido

### 2.1 Rotas HTTP órfãs (4 arquivos)

- `app/api/approval/route.ts`
- `app/api/meta/agents/route.ts`
- `app/api/meta/build/route.ts`
- `app/api/meta/build/resume/route.ts`

> As pastas `app/api/approval/` e `app/api/meta/` (vazias após a remoção) também foram apagadas.

### 2.2 Workflows órfãos — dependem só das rotas acima (2 arquivos)

- `src/mastra/workflows/approval.ts` (`approvalWorkflow`)
- `src/mastra/meta/workflows/build-agent-workflow.ts` (`buildAgentWorkflow`)

**Por que podem sair**: ambos os workflows eram servidos **apenas** pelas rotas órfãs (`mastra.getWorkflow(...)` só ocorria nelas — verificado). Nada no fluxo principal os dispara:

- `requireApprovalTool` do kernel (o human-in-the-loop do chat) é **determinístico**: retorna `approved:false` e preserva estado, **sem** disparar `approvalWorkflow` via HTTP. Remover o workflow não o quebra.
- O `nullainMetaAgent` (vivo) e o `buildAgentWorkflow` (removido) eram **irmãos que compartilham as mesmas tools** (`spec-tool`, `generate-code-tool`, `run-code-tool`, `register-agent-tool`, `specialists`). Como o meta-agent permanece, **nenhum arquivo de tools ficou órfão**.

### 2.3 Edição em `src/mastra/index.ts`

- Removidos os `import` de `buildAgentWorkflow` e `approvalWorkflow`.
- Removidos os registros no objeto `workflows` — agora restam só `intentRouterWorkflow`.
- **Mantidos** `nullainMetaAgent` (import + registro) e `setMastraForRegistration`.

---

## 3. Correções de tipo pré-existentes (build limpo)

Durante a validação, o `tsc --noEmit` revelou erros que **já existiam** (arquivos das FASEs 1/2, não tocados pela FASE 4). Como a FASE 4 exige build de produção limpo, corrigi:

| Arquivo                                  | Erro                                                                         | Correção                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `app/api/ag-ui/[agent]/route.ts:110`     | `getAgent(agentKey)` — `agentKey` é `string`, `getAgent` espera union de IDs | cast para `Parameters<typeof mastra.getAgent>[0]`         |
| `app/api/ag-ui/[agent]/route.ts:156,163` | `TEXT_MESSAGE_END` sem `as BaseEvent`                                        | adicionado cast consistente + `import type { BaseEvent }` |
| `src/mastra/agui/gateway-tools.ts:87`    | `execute(args: Record<...>)` incompatível com `ToolExecuteFunction`          | `execute` agora recebe `inputData` e faz cast interno     |

> Nenhum desses arquivos foi alterado na FASE 4 originalmente — o agente Mastra continuava funcionando em runtime apesar dos erros de tipo. As correções apenas alinham a tipagem.

---

## 4. Validação executada

| Validação                                                   | Resultado                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                          | ✅ exit 0 (sem erros)                                                                                                                          |
| `npx vitest run`                                            | ✅ **16/16 testes passaram**                                                                                                                   |
| `npx next build`                                            | ✅ build de produção OK — só restam 6 rotas (`/`, `/api/ag-ui/[agent]`, `/api/chat`, `/api/integrations`, `/api/skills`, `/api/skills/[name]`) |
| `POST /api/ag-ui/kernelAgent` (com token)                   | ✅ 200 `text/event-stream` → `RUN_STARTED` + `TEXT_MESSAGE_START` (coworker OpenBot funciona)                                                  |
| `POST /api/approval` `/api/meta/agents` `/api/meta/build`   | ✅ **404** (removidas — antes eram 500 por erro de compilação)                                                                                 |
| Rotas vivas `/api/chat`, `/api/skills`, `/api/integrations` | ✅ 200 (intactas, com consumidores ativos)                                                                                                     |

**Incidente técnico**: o dev server apresentou _Turbopack panic_ (`Failed to restore data for task ... .sst`) causado por **cache corrompido** em `.next/dev/cache/turbopack`. O cache foi removido e o servidor subiu limpo (`Ready in 1.9s`). O erro "_the name agent is defined multiple times_" era do servidor antigo com cache corrompido — **não existe no código atual** (a declaração `const agent` ocorre uma única vez).

---

## 5. Estado final da API

```
POST /api/chat             ← chat da UI Nullain (assistant-ui)
GET/POST /api/skills       ← painel de skills (upload .md/.zip)
DELETE /api/skills/[name]  ← remover skill
GET/POST/DELETE /api/integrations  ← Composio connector
POST /api/ag-ui/[agent]    ← adaptador AG-UI para o OpenBot (kernel, chat,
                              research, coding, synthesis, nullainMeta) + gateway tools
```

**Removidas**: `/api/approval`, `/api/meta/*` (agents, build, build/resume).

---

## 6. Decisões e princípios respeitados

- **Nada de cirurgia**: todo o código _vivo_ (chat, skills, integrações, meta-agent, gateway, AG-UI) ficou intocado. Só saiu o que o relatório provou órfão.
- **Remoção guiada por consumidor, não por documentação**: menções em `docs/*.md`, `README.md`, `CHANGELOG.md` e `src/mastra/meta/README.md` **não** contam como consumo ativo.
- **Preservação do human-in-the-loop**: `requireApprovalTool` do kernel continua no fluxo (nega deterministicamente). Se no futuro quiser aprovação resumível, basta reintroduzir um endpoint — o workflow pode ser recriado; nada dependia dele hoje.
- **Build limpo como critério de aceite**: a FASE 4 não se limita a apagar arquivos; exige que `tsc`, testes e `next build` passem.

---

## 7. Próximos passos

A migração Nullain Agent → Nullain OS está **funcionalmente completa**:

- [x] FASE 0 — lab OpenBot + restrições
- [x] FASE 1 — AG-UI coworker graft
- [x] FASE 2 — integrações governadas (Composio)
- [x] FASE 3 — Take the Wheel + identidade (dark, Bloub)
- [x] **FASE 4 — consolidação (este doc)**

**Único item não exercitado end-to-end**: o _handoff real_ com uma credencial de teste (Gmail/Reddit), que exige que o usuário digite a senha na tela (regra: o modelo nunca digita segredos). Todas as peças do mecanismo (ControlState, ComputerView, gateway, redação de segredos) foram validadas individualmente nas FASEs 3/4.
