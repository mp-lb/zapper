# Repository Instructions

Read this file before making changes in this repository.

## Structure

- Put authored skills in `authored-skills/<skill-name>/`.
- Put authoring process, style rules, and templates in `authoring/`.
- Keep service metadata in hidden service folders such as `.forum/`.
- Do not add loose files at the repository root unless a tool requires the file at root.
- Keep `forum.yaml` at the repository root so `fm` can discover checkout sync config.
- Keep `README.md` at the repository root for install and publishing instructions.
- Treat the public Forum store as the website for this repository:
`https://app.forumlabs.net/s/felixsebastian/skills/README.md`.
- After making changes, always run `fm sync`.

## Skill Folders

Each skill folder must contain `SKILL.md`.

Use this layout only when needed:

```text
authored-skills/<skill-name>/
├── SKILL.md
├── agents/openai.yaml
├── references/
├── scripts/
└── assets/
```

Create optional folders only when the skill actually uses them.

## Skill Writing Style

- Write for Codex, not for humans.
- Use direct imperative instructions.
- Omit introductions, background, marketing language, and explanations of what the file is.
- Prefer commands and decision rules over prose.
- Keep `SKILL.md` short; move detailed material into `references/`.
- Use lowercase hyphenated skill names.

Use:

```text
Run `thing.sh` and write the output to `references/output.md`.
```

Avoid:

```text
This file explains how to run a script and create a reference document.
```

## Validation

Before considering a skill ready:

- Confirm `SKILL.md` has only `name` and `description` in YAML frontmatter.
- Confirm the description says when Codex should use the skill.
- Confirm all referenced files exist.
- Confirm scripts run successfully if the skill includes scripts.

