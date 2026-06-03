---
question: "What does the product do?"
inputs: ["source-material.md"]
outputs: ["list-of-competitors.md", "unique-capabilities.md"]
---

# Product Features

## Evidence

- Ingests support tickets from Zendesk.
- Clusters recurring issues into themes.
- Links each theme to the customer accounts it affects.
- Exports prioritized roadmap notes for product managers.

## Inferences

- The product operates on the full ticket stream rather than a sampled subset, since clustering and account linking imply systematic processing.
- Prioritization likely uses ticket volume and affected-account weight, given the B2B framing where account impact matters more than ticket count alone.
- Output is read by product managers inside their existing planning workflow, not by support agents inside Zendesk.

## What it is not (from available evidence)

- Not a ticketing or helpdesk replacement; Zendesk remains the system of record.
- Not a general-purpose research repository; the input is specifically support tickets.
- Not a roadmap tool; it produces notes that feed a roadmap rather than hosting one.
