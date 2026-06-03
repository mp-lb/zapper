---
question: How do buyers solve this problem today?
inputs:
  - Named alternatives: spreadsheets, Productboard, Dovetail, manually reading tickets
outputs:
  - Named alternative behaviors
  - What each alternative does and where it falls short for this job
---

# How do buyers solve this problem today?

Product managers at small B2B SaaS teams currently use one or more of the following:

## 1. Manually reading tickets

**Behavior:** The PM (or a support lead) opens Zendesk and reads tickets directly, forming impressions about recurring issues.

**Falls short because (Inference):**
- Does not scale beyond a small ticket volume.
- Pattern detection depends on human memory; recurring issues across weeks are easy to miss.
- No structured link from issue → affected accounts.

## 2. Spreadsheets

**Behavior:** Tickets or summaries are exported into a spreadsheet, tagged by hand, and counted.

**Falls short because (Inference):**
- Manual tagging is inconsistent and labor-intensive.
- Account linkage requires extra columns and lookups.
- Output is a sheet, not a roadmap artifact.

## 3. Productboard

**Behavior:** A product management platform for collecting feedback, prioritizing features, and sharing roadmaps. Feedback can be sent in from various sources and linked to features.

**Falls short for this specific job because (Inference):**
- Productboard is broad product management software; the support-ticket → theme clustering workflow is one piece among many.
- Clustering is typically driven by human tagging of incoming feedback rather than automated clustering of raw ticket text.
- Heavier tool than a small SaaS team may want for the narrow job of turning Zendesk tickets into roadmap themes.

## 4. Dovetail

**Behavior:** A research repository and analysis tool. Teams paste in interviews, tickets, or notes, tag highlights, and build themes.

**Falls short for this specific job because (Inference):**
- Dovetail is positioned for qualitative research workflows, not automated Zendesk ingestion.
- Tagging and theme building is largely manual.
- Account linkage to themes is not a native concept the way it is in B2B account-led tools.

## Summary table

| Alternative | Automated? | Zendesk-native? | Theme ↔ account link? | Roadmap output? |
|---|---|---|---|---|
| Manually reading tickets | No | Yes (read in place) | No | No |
| Spreadsheets | No | No | Manual | No |
| Productboard | Partial | Via integration | Possible | Yes |
| Dovetail | No | Via paste/import | No | No |
| **TestApp** | **Yes** | **Yes** | **Yes** | **Yes** |

**Note:** Comparison rows for competitors are **Inference** based on general knowledge of those products; they have not been validated against current product documentation.
