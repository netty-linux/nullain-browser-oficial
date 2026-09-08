---
name: commit-writer
description: Write Conventional Commit messages from a diff or a description of code changes. Use when the user asks for a commit message, wants to commit changes, or needs a commit-ready summary.
metadata:
  nullain-display-name: "Commit Writer"
  nullain-summary: "Writes focused Conventional Commit messages from code changes."
---

# Commit Writer

Create a commit message that reflects the actual change and its intent.

## Procedure

1. Inspect the diff or the user's change description. Identify the unifying behavior change rather than listing files.
2. Choose the narrowest accurate type: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, or `style`.
3. Add a scope only when one clear module owns the change.
4. Write the subject in imperative mood, lowercase, without a trailing period, and keep it within 72 characters.
5. Add a body only when the motivation, tradeoff, or non-obvious behavior needs explanation. Wrap body lines near 72 characters.
6. Use `BREAKING CHANGE:` or an issue footer only when supported by the provided changes.
7. If the changes are unrelated, propose separate commits instead of hiding them under one vague subject.

Use the language requested by the user; otherwise match the language of the conversation. Preserve Conventional Commit types in English.

```text
<type>(<optional-scope>): <imperative subject>

<optional body explaining why>

<optional footer>
```
