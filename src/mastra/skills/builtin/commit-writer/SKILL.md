---
name: commit-writer
description: Escreve mensagens de commit convencionais (conventional commits) a partir do diff ou da descrição das mudanças. Use quando o usuário pedir para criar/escrever uma mensagem de commit, commit message, ou resumir mudanças para commit.
---

# Commit Writer — conventional commits

## Quando usar

O usuário pede mensagem de commit, quer commitar mudanças, ou descreve o que mudou e quer o resumo formatado.

## Formato

```
<tipo>(<escopo opcional>): <descrição em imperativo, minúscula, sem ponto final>

[corpo opcional: o PORQUÊ da mudança, wrap em 72 chars]

[Bulk opcional: BREAKING CHANGE: descrição / Closes #123]
```

## Tipos

| Tipo       | Uso                                     |
| ---------- | --------------------------------------- |
| `feat`     | nova funcionalidade                     |
| `fix`      | correção de bug                         |
| `refactor` | mudança interna sem mudar comportamento |
| `perf`     | melhoria de performance                 |
| `docs`     | documentação                            |
| `test`     | testes                                  |
| `chore`    | build, deps, config, tooling            |
| `style`    | formatação, espaços                     |

## Procedimento

1. Se o usuário colou um diff: identifique os arquivos mais significativos e o tema unificador — não liste arquivo por arquivo.
2. Descrição: o que MUDA, em imperativo ("adiciona toggle", não "adicionado toggle"). Máx 72 chars.
3. Corpo (se a mudança for complexa): explique o porquê, não o como.
4. Escopo: use o módulo principal entre parênteses quando óbvio (ex.: `feat(web-search):`).
5. Múltiplas mudanças não-relacionadas → proponha commits separados.

## Exemplos

```
feat(computer): adiciona navegação com browser real

centraliza pesquisas no OpenBot e mantém o acesso à web controlado
pelo toggle do usuário.
```

```
fix(chat): evita resposta vazia quando modelo estoura steps

gpt-oss com effort high raciocinava além do maxSteps sem emitir
texto. Retry sem tools com digest dos resultados coletados.
```
