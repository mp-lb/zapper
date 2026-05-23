---
name: value-analysis
description: Use when Codex needs to build a strict value-analysis or positioning documentation library from product inputs, especially to map features, alternatives, unique value, ideal customers, and positioning.
---

# Value Analysis

## Workflow

1. Read `references/index.md`.
2. Ask for the documentation library location when the user has not specified one.
3. Stop if the location already exists and contains any file or folder.
4. Ask for missing product source material using `references/inputs.md`.
5. Create a small Markdown documentation library at the specified location.
6. Use `references/marketing-positioning.md` for the positioning sequence.
7. Create exactly the filenames listed in `references/index.md`.
8. Do not create substitute filenames or omit required files.
9. Keep each document focused on one question.
10. Add YAML frontmatter to every generated document, including `README.md`, with `question` and `inputs`.
11. Mark unsupported claims as inference.
12. Ask for user feedback only when the next document depends on product reality the available inputs do not show.

## Output Rules

- Do not write into a non-empty location.
- Do not create long reports.
- Do not combine unrelated questions into one document.
- Do not rename the required output documents.
- Prefer concrete product facts over generic marketing advice.
- Name the alternative behaviors buyers already use.
- Separate evidence from inference.
