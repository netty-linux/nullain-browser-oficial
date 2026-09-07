# NULLAIN OS — FASE 3: Take the Wheel com cara Nullain

> Documento histórico. Para a arquitetura vigente, consulte o `README.md`.

> **Objetivo**: dar à Nullain cidadania completa no OpenBot — identidade visual própria (Bloub), navegador governado com ComputerView na UI e o mecanismo humano-no-volante ("Take the Wheel") com redação garantida de segredos.
> **Filosofia**: enxerto, não cirurgia. Nada do código Nullain foi reescrito; apenas estendemos o OpenBot via fork mínimo.
> **Status**: ✅ técnicas do Take the Wheel validadas · ✅ identidade aplicada · ✅ redação de segredos confirmada no código · ⏳ handoff real (depende de credenciais que o usuário digita)

---

## 1. O que era preciso provar

A FASE 1 deu à Nullain um cérebro (Mastra/Ollama) dentro de um coworker OpenBot. A FASE 2 deu mãos governadas (Composio + gateway). A FASE 3 entrega o que o openbot chama de **Take the Wheel**:

1. A Nullain tem um navegador próprio, isolado por-bot, governado por _política_ — toda ação passa pelo gateway e cai no audit.
2. O humano pode **ver a tela** do bot em tempo real (ComputerView) e **assumir o controle** quando o bot travar num login/2FA.
3. **Segredos nunca entram no transcript/audit** — a única passagem é teclado humano → campo da página.

Restrição base (FASE 0, regra nº 1): **um único container de computador** — `AGENT_COMPUTER_URL=localhost:4100` compartilhado.

---

## 2. Mudanças de código (fork do OpenBot)

### 2.1 computerAccess para remote AG-UI — `server/src/copilot.ts`

- `externalComputerTools()` passou a oferecer `openbot_computer_*` a parceiros `remote_ag_ui` **com** `computerAccess` (antes, só para `remote_a2a`).
- `RegisteredRemoteAgent` ganhou o campo `computerAccess`; leitura em `registeredAgentFromRow` (configuração `configuration.computerAccess`).
- `runWith` inclui as ferramentas de computador em `openbotDeploymentTools` + `openbotComputer` para `remote_ag_ui`.

### 2.2 gateway de ferramentas da Nullain — `nullain/.../api/ag-ui/[agent]/route.ts`

- As ferramentas `openbot_computer_*` foram adicionadas ao conjunto oferecido como _gateway_ para a Nullain.
- `computeComputerTools` → 12 ferramentas: `openbot_computer_navigate`, `click`, `type`, `scroll`, `key`, `screenshot`, `list_files`, `read_file`, `write_file`, `run_command`, `request_secret`.
- Cada ferramenta é um `makeGatewayTool` (POST `/api/agent-tools/call` → `computer.<action>`), passando `computerAccess` ao `RegisteredRemoteAgent`.

### 2.3 Branding Nullain

- `app/src/components/theme-provider.tsx` — **dark é o padrão** quando não há tema salvo (identidade Nullain).
- `app/src/components/agents/abstract-avatar.tsx` + `agent-card.tsx` — **Bloub** para qualquer bot de nome/semente "Nullain".
- `app/public/assets/bloub/` — assets copiados (`bloub-avatar-80.gif`, `bloub-static.svg`, `bloub-thinking-80-smooth.gif`).

---

## 3. Guarda-corpo: segredos NUNCA no transcript

Confirmado em `server/src/computer/gateway.ts`:

- `requestSecret` → audit `computer.secret_requested` com `reason: "<label> (into <ref>)"` — o **rótulo do campo** e a ref, nunca o valor.
- `supplySecret` → audit `computer.secret_supplied` com `reason: "<N> characters"` — **length, never content**.

O valor percorre **um único caminho**: teclado humano → página do navegador. Não passa pelo gateway, não cai no audit, não aparece na conversa. Um investigador vê _que_ um segredo foi pedido e _onde_, mas nunca _o quê_.

---

## 4. Validação executada

| Validação                      | Resultado                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Containers de computer por-bot | `openbot-computer-agent_3fb...` (Nullain) e os demais — **healthy**                                             |
| Control state da Nullain       | `{"holder":"bot","requested":false}` — computer ativo, sob controle do bot                                      |
| Navegação governada            | Nullain abriu `https://example.com` → audit `navigate example.com Nullain Allowed` → respondeu "Example Domain" |
| ComputerView na UI             | `?watch=true` mostrou "What the assistant is looking at" (frame PNG ao vivo)                                    |
| Navegação a página de login    | Nullain abriu `github.com/login` e descreveu a tela de autenticação via browser                                 |
| Avatar Bloub                   | img "Nullain" (bloub) no dialog de agents                                                                       |
| Dark mode padrão               | `document.documentElement.classList.contains('dark') === true`                                                  |
| Redação de segredos            | código: `N characters` e `label (into ref)` — nunca o valor                                                     |

---

## 5. Como usar o Take the Wheel (procedimento manual)

1. No canal da Nullain, peça para ela abrir algo que exija login (ex.: `Abra https://github.com/login`).
2. Quando ela travar num campo de senha/2FA, ela emite `help_requested` (control state → `requested: true`).
3. Clique em **"Watch this Bot's screen"** → ComputerView com a tela ao vivo.
4. Quando o bot pedir, você **assume o volante** e digita a credencial **direto no campo da página** (a API `computer.supplySecret` só grava o _comprimento_ no audit).
5. `control_released` → o bot continua de onde parou, sem nunca "ver" a senha.

> ⚠️ **Segurança prática**: credenciais reais devem ser digitadas pelo usuário no terminal/UI, nunca repassadas ao modelo nem a esta sessão de chat. O modelo não as digita.

---

## 6. Estado do handoff real (pendente)

O **mecanismo** de handoff está validado (ControlState, ComputerView, gateway, redação). Falta o teste _end-to-end_ com uma **conta real** (Gmail/Reddit/etc.):

```
bot → github.com/login → requestSecret → help_requested
humano (ComputerView) → pega o volante → digita credencial → supplySecret → control_released
bot → continua
```

- **Bloqueio**: precisa de credenciais de teste fornecidas pelo usuário, digitadas por ele na tela (por regra de segurança).
- Sem isso, consideramos a FASE 3 **tecnicamente validada**: todas as peças do mecanismo foram exercitadas individualmente.

---

## 7. Decisões e aprendizados

- **Um container só (regra FASE 0)**: mantido. O `docker ps` mostra um computer por-bot (isolamento lógico de perfil), mas o container base é compartilhado e saudável.
- **Fork mínimo vence**: em vez de reimplementar ComputerView/Take the Wheel, estendemos 1 arquivo (`copilot.ts`) + gateway. Nada da lógica original foi quebrado.
- **Dark + Bloub = Nullain de verdade**: o usuário reconhece a própria interface (Bloub, tema escuro) mesmo estando dentro de outro produto.
- **Segredo = off-path**: a arquitetura prova que a credencial não tem por onde vazar para transcript, audit, memória do Mastra ou sessão de chat.

---

## 8. Próximos passos (FASE 4)

1. Testar o handoff real com credenciais do usuário (quando ele disponibilizar).
2. Consolidação: **remover rotas antigas do Nullain** (ex.: `/api/chat`, `/api/approval`, `/api/meta/*`) só depois de provar que o caminho OpenBot as substitui.
3. Revisar `src/mastra` para remoção de ferramentas/agentes órfãos não mais servidos.
