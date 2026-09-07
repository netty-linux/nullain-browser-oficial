# Nullain Agent

Assistente open source construído com Mastra, Ollama Cloud, Next.js e assistant-ui.

<img width="1917" height="914" alt="image" src="https://github.com/user-attachments/assets/549eff33-eeb9-47a8-8482-9f7925940520" />


## Recursos

- Kernel supervisor com processos especializados de pesquisa, código e síntese.
- Pesquisa pela web exclusivamente pelo Computador/OpenBot, controlada pelo usuário.
- Memória persistente em LibSQL por conversa.
- Skills com carregamento progressivo e suporte a upload de pacotes.
- Plugins via Composio MCP.
- Geração de imagem e vídeo via WaveSpeed.
- Streaming de resposta, raciocínio e tool calls na interface.

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

## Scripts

```bash
npm run dev       # desenvolvimento
npm run build     # build de produção
npm run test      # testes automatizados
npm run lint      # lint e formatação
npm run lint:fix  # correções automáticas
```

## Licença

MIT © Nullain
