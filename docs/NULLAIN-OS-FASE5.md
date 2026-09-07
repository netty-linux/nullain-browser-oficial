# NULLAIN OS — FASE 5 (parte 1): Inversão de arquitetura — a tela do computador na UI Nullain

> Documento histórico. Para a arquitetura vigente, consulte o `README.md`.

> **Objetivo**: inverter a arquitetura. Antes, a Nullain rodava como coworker **dentro** da UI do OpenBot (`:3010`). Agora a **UI Nullain (`:3000`) vira a interface principal**, e os componentes de computador/take-the-wheel do OpenBot são **portados para ela**.
> **Filosofia (mantida)**: enxerto, não cirurgia. Nada de reescrever. O que veio do OpenBot foi **portado** (quase 1:1 quando agnóstico, adaptado quando necessário).
> **Status**: ✅ visual validado E2E na UI Nullain (tela ao vivo + take control + hand back) · ✅ build OK · ✅ 16/16 testes.

---

## 1. A correção de direção

| Antes (FASEs 0–4)                                             | Depois (FASE 5)                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Você conversava com a Nullain **dentro** do OpenBot (`:3010`) | Você conversa com a Nullain **na própria UI** (`:3000`)     |
| A tela do computador vivia **no front-end do OpenBot**        | A tela do computador agora vive **no front-end da Nullain** |
| OpenBot era a "casca"                                         | **Nullain é a casa**                                        |

A infraestrutura de backend (computador, política, audit) continua no servidor do OpenBot (`:3001`) — mantido como backend, conforme decidido. O que migrou foi a **camada de interface**.

---

## 2. Decisões confirmadas pelo usuário

1. **Escopo portado**: tela do computador (ComputerView + live), take-the-wheel (controle + secret), painel de coworkers/agentes, log de atividade.
2. **Stack de integração**: renderizar inline no chat como _tool_ (padrão do OpenBot) via assistant-ui (`useAssistantToolUI`) + painel lateral fixo.
3. **Backend**: manter o servidor do OpenBot (`:3001`) como backend de computador. **Zero backend novo.**

> Esta primeira entrega foca na **tela + controle + secret** (painel lateral + tool UI). Coworkers/agentes e log de atividade ficam para as próximas partes.

---

## 3. Por que o componente é "portado 1:1"

O mapeamento (FASE 5, mapa) mostrou que o `ComputerView`/`LiveScreen` do OpenBot são **agnósticos de runtime**: usam apenas `fetch` + `WebSocket`, sem depender do CopilotKit. O único acoplamento ao OpenBot eram as libs de acesso (`lib/computers/*`) e os componentes de UI (shadcn). Portanto:

- `lib/computers/{client,screen,control}.ts` → portados **quase 1:1** (adaptada apenas a base de request).
- `ComputerView` → portado, trocando os componentes shadcn do OpenBot pelos da Nullain (`Button`, `Input`, `cn`).
- O **transporte** de chat difere: OpenBot usa CopilotKit (`useFrontendTool`), Nullain usa assistant-ui (`useAssistantToolUI`) — este é o ponto de reescrita.

---

## 4. O bloqueio técnico resolvido: autenticação/CORS

Os endpoints de computador do OpenBot (`/api/computers/*`) exigem **sessão de usuário** (cookie better-auth) e o servidor **não tem CORS de propósito** (`server/src/app.ts:1190`). A UI Nullain está em outra porta.

**Solução (escolhida): proxy Rewrite server-side na Nullain.**

```
UI Nullain (:3000)  →  GET/POST /api/computers/<id>/*
                          (app/api/computers/[...path]/route.ts)
                              │ repassa cookie de sessão (header "cookie")
                              ▼
                       OpenBot server (:3001): /api/computers/*
                              │
                              ▼
                       Computador do bot (container isolado)
```

Como os cookies em `localhost` são scoped por **host** (não por porta), o request do browser para `:3000` já carrega o cookie de sessão do OpenBot. O proxy server-side o repassa intacto ao upstream. Resultado: a UI Nullain fala com o computador "como se fosse da mesma origem", **sem CORS e sem fork no OpenBot**.

> **Nota**: em produção (domínios reais), este proxy precisará lidar com a sessão de forma explícita (ex.: forward de token). Para o lab local, o cookie `localhost` basta.

---

## 5. O que foi gerado na Nullain

### 5.1 Proxy do computador — `app/api/computers/[...path]/route.ts`

- Repassa `GET/POST/PUT/PATCH/DELETE /api/computers/*` → OpenBot.
- Preserva método, `content-type` e o header **Cookie** da sessão.
- `OPENBOT_API_URL` (default `http://localhost:3001`), timeout 45s, `AbortSignal.timeout`.

### 5.2 Libs portadas — `lib/computers/`

- `client.ts` — `tryClient` (fetch com `credentials: "include"`, JSON).
- `screen.ts` — `readScreenshot`, `readPageFrame` (tipos `Screenshot`, `PageFrame`).
- `control.ts` — `readControl`, `takeControl`, `releaseControl`, `supplySecret`, `sendHumanInput` (tipos `ControlState`).

### 5.3 Componentes portados

- **`components/assistant-ui/computer-view.tsx`** — `ComputerView`: polling de screenshot (1s), polling de controle (1s), take control / hand back, prompt mascarado de **secret** (vai direto à página, nunca à conversa), frame histórico por turno (`REMEMBERED_TURNS`), badge "You have control".
- **`components/assistant-ui/computer-tool-ui.tsx`** — registra via `useAssistantToolUI` a tool `openbot_computer_navigate` para renderizar a tela **inline no chat** quando o bot navega.
- **`components/assistant-ui/computer-panel.tsx`** — painel lateral fixo "Computer" (com `ComputerView` contínuo).

### 5.4 Sidebar — `components/assistant-ui/threadlist-sidebar.tsx`

- Agora com **3 abas**: `Chats | Skills | Computer`.
- `ComputerPanel` montado quando a aba Computer é selecionada.

### 5.5 Integração no app — `app/assistant.tsx`

- `ComputerToolUI` registrado dentro do `AssistantRuntimeProvider`.

---

## 6. Validação E2E executada (na UI Nullain `:3000`)

| Validação                                       | Resultado                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Tipo (`npx tsc --noEmit`)                       | ✅ exit 0                                                                  |
| Testes (`npx vitest run`)                       | ✅ **16/16 passaram**                                                      |
| Build prod (`npx next build`)                   | ✅ nova rota `/api/computers/[...path]` compilada                          |
| Proxy: `/api/computers/<id>/status` via Nullain | ✅ `200 {"state":"ready"}`                                                 |
| Screenshot ao vivo                              | ✅ frame PNG real (~49KB) — tela mostrava `https://github.com/login`       |
| Aba "Computer" na sidebar                       | ✅ renderiza `ComputerView` + rodapé de controle                           |
| **Take control**                                | ✅ badge "You have control" + rodapé "You control this computer"           |
| **Hand back**                                   | ✅ controle voltou ao bot (`holder:"bot"`, novo timestamp)                 |
| Secret off-transcript                           | ✅ (código preserva o caminho direto à página; audit só grava comprimento) |

---

## 7. Estado final da inversão (o que agora está na casa Nullain)

```
Nullain Agent UI (:3000)
├── Chat (assistant-ui, /api/chat) + Streaming + Bloub + dark
├── Sidebar: Chats | Skills | Computer
│     └── ComputerPanel → ComputerView (tela ao vivo + take control + secret)
└── Tool UI inline: openbot_computer_navigate → tela no chat
      │
      ▼ (proxy server-side /api/computers/[...path])
OpenBot backend (:3001) — computador + política + audit
```

---

## 8. FASE 5 — parte 2: tool de navegação inline no `/api/chat` (CONCLUÍDA)

### 8.1 O que foi adicionado

Quando você conversa pela UI Nullain (`/api/chat`) e pede algo como _"abra X no seu navegador"_, o kernel agora pode chamar `openbot_computer_navigate`, a navegação é executada **no browser** e a tela + o resultado aparecem **inline no chat** — sem precisar abrir o painel lateral.

| Peça                                                     | Arquivo                                        |
| -------------------------------------------------------- | ---------------------------------------------- |
| **Client tool** de navegação (sem `execute` server-side) | `src/mastra/tools/computer-client-tools.ts`    |
| Registro no stream do chat (`streamOptions.clientTools`) | `app/api/chat/route.ts`                        |
| Execução no browser + `addResult` + ComputerView inline  | `components/assistant-ui/computer-tool-ui.tsx` |

### 8.2 Abordagem: Mastra `clientTools` (replica do padrão do OpenBot)

A chave é que `openbot_computer_navigate` é uma **client tool do Mastra** — uma tool **sem função `execute`**. Isso foi confirmado no próprio código do Mastra (`agent-DSxJoGjY.js:17949`):

> _"For client-side tools (no execute function), 'call' is the final state from the server's perspective."_

Ou seja:

- O **servidor Mastra** declara a tool ao modelo e emite a tool-call, mas **não a executa** (e para nela).
- O **browser** intercepta (via `useAssistantToolUI`), executa a navegação chamando o proxy local (`POST /api/computers/<id>/navigate`, que repassa o cookie de sessão ao OpenBot), e devolve o resultado ao modelo via `addResult`.
- O `ComputerView` é renderizado inline, exatamente como o OpenBot faz com `computer_navigate`.

### 8.3 Validação E2E (parte 2)

| Validação                                     | Resultado                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/chat` com pedido de navegação      | ✅ kernel chamou `openbot_computer_navigate` (1 tool call)                        |
| `POST /api/computers/<id>/navigate` via proxy | ✅ 200                                                                            |
| Computador                                    | ✅ `url=https://example.com`, `title=Example Domain`                              |
| Resposta do modelo                            | ✅ citou o conteúdo real da página ("This domain is for use in documentation...") |
| ComputerView inline                           | ✅ renderizado na thread                                                          |

---

## 9. FASE 5 — parte 3: painel de coworkers/agentes (CONCLUÍDA)

### 9.1 O que foi adicionado

Uma nova aba **Team** na sidebar mostra o **roster de coworkers/agentes** do OpenBot (Survival Bot, General Assistant, Knowledge, Risk Analyst, Nullain...), dentro da casa Nullain.

| Peça                                                                                 | Arquivo                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **Proxy genérico** para endpoints do OpenBot (`/api/agents/*`, etc.)                 | `app/api/ob/[...path]/route.ts`                  |
| **Painel de coworkers** (lista, Bloub p/ Nullain, badges computer/built-in, refresh) | `components/assistant-ui/coworkers-panel.tsx`    |
| Registro na sidebar (4 abas: Chats \| Skills \| Computer \| Team)                    | `components/assistant-ui/threadlist-sidebar.tsx` |

> O proxy `/api/ob/[...path]` replica o padrão do proxy de computadores: repassa método, `content-type` e o **cookie de sessão** ao OpenBot (`:3001`), sem CORS e sem fork.

### 9.2 Validação E2E (parte 3)

| Validação                      | Resultado                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/ob/agents` via proxy | ✅ `200 {"agents":[5 coworkers]}`                                                                           |
| Painel "Team"                  | ✅ lista Survival Bot (built-in), General Assistant, Knowledge, Risk Analyst (built-in), Nullain (computer) |
| Bloub para Nullain             | ✅ mascote usado para o coworker Nullain                                                                    |
| Typecheck / testes / build     | ✅ tsc exit 0 · 16/16 testes · `next build` OK (`/api/ob/[...path]` presente)                               |

---

## 10. Pendências documentadas (baixa prioridade)

1. **`LiveScreen` (WebSocket) / direção fluida com mouse**: o polling (screenshot 1s + control) já cobre _ver a tela ao vivo, take control e secret_. O screencast CDP de baixa latência exigiria um **proxy WebSocket** no Next (route handlers do Next 16 usam Web API Request/Response e não expõem upgrade WS trivial; o OpenBot consegue porque o front Vite faz `proxy: { "/api": { ws: true } }`). Arriscado para o build com Turbopack — **deixado como opção futura**, apontando o WS direto ao OpenBot caso queira direção fluida com mouse.

2. **Log de atividade do computador**: no OpenBot é **client-side** (alimentado pelos tool handlers de `command`/`read_file`/`write_file`, sem endpoint). Como hoje a Nullain expõe apenas `openbot_computer_navigate`, um "activity log" de comandos não se aplica ainda. Se no futuro você expor command/read/write, basta re-portar `activity.ts` (store em memória) + `activity-log.tsx`.

---

## 11. Estado da inversão — resumo funcional

A inversão está **funcionalmente completa nos casos de valor**:

| Capacidade                    | Local (UI Nullain)                              | Status |
| ----------------------------- | ----------------------------------------------- | ------ |
| Ver tela do bot ao vivo       | Painel "Computer" (polling)                     | ✅     |
| Navegar inline ao pedir       | Tool `openbot_computer_navigate` inline no chat | ✅     |
| **Take control** / Hand back  | Botões no ComputerView                          | ✅     |
| **Secret** off-transcript     | Prompt mascarado no ComputerView                | ✅     |
| Listar **coworkers**          | Aba "Team"                                      | ✅     |
| Dark mode + Bloub + streaming | Nativo                                          | ✅     |

_Esta entrega completa a inversão: o computador do bot, o controle humano (take-the-wheel) com redação de segredos, e o roster de coworkers — todos visíveis e operáveis de dentro da própria interface Nullain._
