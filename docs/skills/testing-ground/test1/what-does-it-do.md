---
question: What does TestApp do?
inputs:
  - Source material: ingests Zendesk tickets, clusters recurring issues, links themes to affected accounts, exports prioritized roadmap notes
outputs:
  - Capability list
  - Input/output flow
---

# What does TestApp do?

TestApp turns support tickets into product feedback themes for product managers.

## Capabilities (from source material)

1. **Ingest Zendesk tickets** — pulls ticket data directly from Zendesk.
2. **Cluster recurring issues** — groups tickets that describe the same underlying issue into themes.
3. **Link themes to affected accounts** — each theme carries the list of accounts that raised it.
4. **Export prioritized roadmap notes** — outputs ranked, roadmap-ready notes for the PM.

## Flow

```
Zendesk tickets  →  Clustered themes  →  Themes ↔ Accounts  →  Prioritized roadmap notes
```

## What is explicitly stated vs inferred

| Claim | Status |
|---|---|
| Ingests Zendesk tickets | Stated |
| Clusters recurring issues | Stated |
| Links themes to affected accounts | Stated |
| Exports prioritized roadmap notes | Stated |
| Prioritization method (e.g. account ARR weighting, frequency, recency) | **Inference** — not specified |
| Other ticket sources (Intercom, email, etc.) | **Inference** — not in scope per source material |
| In-product collaboration / commenting | **Inference** — not specified |
