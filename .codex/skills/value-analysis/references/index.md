Build a documentation library, not a report.

Required location rule:

- Ask for the target folder if the user did not specify it.
- If the target folder exists and contains any file or folder, stop and tell the user it must be empty.
- If the target folder exists and is empty, use it.
- If the target folder does not exist, create it.

Required document map:

Create exactly these files. Do not rename, merge, split, or omit them.

| Document | Question | Inputs |
| --- | --- | --- |
| `README.md` | How do the documents relate to each other? | all generated documents |
| `source-material.md` | What evidence and user-provided context is available? | user input, source files, URLs, docs |
| `product-features.md` | What does the product do? | `source-material.md` |
| `list-of-competitors.md` | What would customers use or do instead? | `source-material.md`, `product-features.md` |
| `unique-capabilities.md` | What can this product do that alternatives cannot credibly claim? | `product-features.md`, `list-of-competitors.md` |
| `value-drivers.md` | Why do the unique capabilities matter? | `unique-capabilities.md` |
| `ideal-customer.md` | Who cares most about those value drivers? | `value-drivers.md`, `list-of-competitors.md` |
| `market-context.md` | What category or frame makes the value obvious? | `ideal-customer.md`, `list-of-competitors.md`, `unique-capabilities.md` |
| `positioning-statement.md` | What is the core positioning statement? | `ideal-customer.md`, `market-context.md`, `value-drivers.md`, `unique-capabilities.md` |
| `open-questions.md` | What important facts are missing or uncertain? | all generated documents |

Required YAML frontmatter for every generated document:

`README.md` must have this frontmatter too.

Put the opening `---` on its own first line.
Put each YAML key on its own line.
Put the closing `---` on its own line after `inputs`.
Do not put Markdown headings or document body content inside the frontmatter.

```yaml
---
question: ""
inputs: []
---
```

Use relative document filenames in `inputs`.

Keep documents small:

- Answer only the document question.
- Use bullets or short sections.
- Include `Evidence` and `Inferences` sections when both exist.
- Put unknowns in `open-questions.md`, not in every document.
