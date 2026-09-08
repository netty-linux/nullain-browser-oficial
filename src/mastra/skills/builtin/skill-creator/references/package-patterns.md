# Package patterns

Choose the smallest package that makes the procedure reliable. A directory is optional; usefulness is not.

| Need                                              | Place it in   | Load or use it when                             |
| ------------------------------------------------- | ------------- | ----------------------------------------------- |
| Core activation and procedure                     | `SKILL.md`    | Every activation                                |
| Detailed domain rules or long examples            | `references/` | The matching branch is reached                  |
| Deterministic transformation or validation        | `scripts/`    | Execution is available and the task requires it |
| Reusable document, configuration, or starter file | `templates/`  | Producing that output                           |
| Static media or output assets                     | `assets/`     | The final artifact needs them                   |

## Progressive disclosure

- Put only the `name` and activation-focused `description` in frontmatter.
- Keep the main workflow and routing decisions in `SKILL.md`.
- Name every supporting path in `SKILL.md` and state the condition for reading or running it.
- Avoid duplicating the same explanation between `SKILL.md` and a reference.
- Prefer one level of resource folders so the package stays discoverable.

## Quality checks

- The directory name exactly matches frontmatter `name`.
- The description says both what the skill handles and when it activates.
- Instructions are imperative, reusable, and contain a verification loop.
- Scripts fail clearly, avoid hidden network access, and use deterministic output where possible.
- Templates contain intentional placeholders and document the values that replace them.
- No credentials, local absolute paths, caches, build products, or unrelated conversation content are bundled.
