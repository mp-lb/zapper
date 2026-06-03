---
question: "How do the documents relate to each other?"
inputs: ["source-material.md", "product-features.md", "list-of-competitors.md", "unique-capabilities.md", "value-drivers.md", "ideal-customer.md", "market-context.md", "positioning-statement.md", "open-questions.md"]
outputs: []
---

# TestApp Positioning Library

A small, document-driven positioning library for **TestApp**, a tool that turns Zendesk support tickets into account-weighted, prioritized roadmap notes for product managers at small B2B SaaS teams.

## Reading order

The documents build on each other. Read top to bottom on first pass.

1. [source-material.md](source-material.md) — what evidence and context is available.
2. [product-features.md](product-features.md) — what the product does.
3. [list-of-competitors.md](list-of-competitors.md) — what customers use or do instead.
4. [unique-capabilities.md](unique-capabilities.md) — what TestApp can claim that alternatives cannot.
5. [value-drivers.md](value-drivers.md) — why those unique capabilities matter.
6. [ideal-customer.md](ideal-customer.md) — who cares most about those value drivers.
7. [market-context.md](market-context.md) — the category frame that makes the value obvious.
8. [positioning-statement.md](positioning-statement.md) — the core positioning statement.
9. [open-questions.md](open-questions.md) — what is missing or uncertain.

## How the documents depend on each other

- `source-material.md` feeds `product-features.md` and `list-of-competitors.md`.
- `product-features.md` and `list-of-competitors.md` feed `unique-capabilities.md`.
- `unique-capabilities.md` feeds `value-drivers.md`.
- `value-drivers.md` and `list-of-competitors.md` feed `ideal-customer.md`.
- `ideal-customer.md`, `list-of-competitors.md`, and `unique-capabilities.md` feed `market-context.md`.
- `ideal-customer.md`, `market-context.md`, `value-drivers.md`, and `unique-capabilities.md` feed `positioning-statement.md`.
- `open-questions.md` collects gaps surfaced across every document.

## How to use this library

- Treat `positioning-statement.md` as the output, not the starting point. If it stops feeling true, change the upstream document first.
- Treat claims in `unique-capabilities.md` as testable. If a named alternative can credibly say the same thing, demote the claim.
- Use `open-questions.md` as the input list for the next round of customer or product research.
