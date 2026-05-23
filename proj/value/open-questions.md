---
question: "What important facts are missing or uncertain?"
inputs:
  - source-material.md
  - product-features.md
  - list-of-competitors.md
  - unique-capabilities.md
  - value-drivers.md
  - ideal-customer.md
  - market-context.md
  - positioning-statement.md
---

## Missing Product Reality

- Which capabilities are fully shipped today versus documented as design direction or near-term roadmap? The repo includes both reference docs and forward-looking design studies.
- Is the macOS app a core product pillar, a companion UX layer, or mainly an internal/operator convenience?
- Which local workflow is most important in practice: mixed native-plus-Docker stacks, profile switching, isolated E2E stacks, or machine-wide project discovery?
- Is "for agents" the primary go-to-market wedge, or a sharper way to describe a broader local-dev product?

## Missing Customer Evidence

- What exact customer language do teams use when describing the current pain?
- Which alternative is most common in the field: Docker Compose, PM2 plus scripts, Taskfile, Procfile-style tools, or manual terminals?
- Who usually champions adoption: individual developers, tech leads, or a formal developer-experience/platform owner?
- What failure mode is expensive enough to trigger adoption: onboarding drag, stack collisions, stale local state, or environment inconsistency?
- Do agent users actually discover Zapper through the "process manager for agents" framing, or do they adopt it first as a better local stack runner?

## Missing Commercial Context

- Is Zapper intended to remain an open-source CLI with companion apps, or is there a larger commercial product plan?
- Are Linux and Windows desktop experiences planned, or is macOS the durable focus for the GUI layer?
- What proof points exist today: active projects, retention, internal usage, testimonials, or before/after setup time?
