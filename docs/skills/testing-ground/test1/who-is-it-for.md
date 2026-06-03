---
question: Who is TestApp built for?
inputs:
  - Stated primary users: product managers
  - Stated buyer segment: small B2B SaaS teams
outputs:
  - Primary user role
  - Buyer segment
  - Inferred ICP boundary conditions
---

# Who is TestApp built for?

## Primary user

**Product managers** at small B2B SaaS teams.

## Buyer segment

**Small B2B SaaS teams** that:

- Run customer support through **Zendesk** (required — TestApp ingests Zendesk tickets).
- Have enough recurring ticket volume that themes can emerge from clustering.
- Sell to **accounts** (not individual consumers) — TestApp links themes to affected accounts.

## ICP boundary conditions (Inference)

- **Inference:** Teams below a minimum ticket volume will not see meaningful clusters. The exact threshold is not specified in the source material.
- **Inference:** Teams not using Zendesk are out of scope until other ticket sources are supported.
- **Inference:** Larger enterprise SaaS organisations likely already have dedicated research or insights teams and may overlap with Dovetail/Productboard workflows rather than TestApp's lighter approach.

## Why product managers specifically

Product managers own the roadmap and need feedback signal from real customers. They sit between support (which holds the raw tickets) and engineering (which needs prioritized work). TestApp's output — **prioritized roadmap notes** — maps directly to a PM's deliverable.
