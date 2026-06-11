# Query Freshness

Frontend queries use `queryPresets` from `src/lib/queryPresets.ts` to express caching intent consistently across the app.

## The two axes

Choosing a preset requires thinking about two independent questions:

1. **How disruptive is a spinner here?** — determines `gcTime`. High gcTime means stale data is shown while revalidating rather than a loading spinner.
2. **How bad is showing stale data?** — determines `staleTime`. High staleTime suppresses background refetches when data is still considered fresh.

These don't always point in the same direction. User preferences change rarely (low staleTime cost) but live in a modal (spinner is acceptable). Workspace profile data is shown in the main flow everywhere (spinner is disruptive) but is also low-consequence if slightly stale.

## Presets

| Preset | staleTime | gcTime | When to use |
|--------|-----------|--------|-------------|
| `ambient` | 5 min | 4 hr | Rendered in the main flow (nav, sidebars, list pages). Spinners here are disruptive. Data changes rarely and staleness is low-consequence. |
| `standard` | 0 | 5 min | TanStack defaults. Spinners are acceptable where this renders (modals, settings panels, admin views). |
| `live` | 0 | 1 min | Frequently changing or time-sensitive data. Must be fresh. |

## Decision guide

**Use `ambient` when:**
- The query renders persistently in the main UI (not inside a modal or overlay)
- A loading spinner would be jarring or appear repeatedly during normal navigation
- Showing data that's a few minutes old has no meaningful consequence
- Examples: store list, workspace profiles, store activity on the home page

**Use `standard` when:**
- The query renders inside a modal, settings panel, or admin view
- A spinner on first load is expected and acceptable
- Data correctness matters more than avoiding a spinner
- Examples: user preferences, encryption keys, billing/usage details, admin data

**Use `live` when:**
- The data changes frequently and users expect it to be current
- Staleness would be confusing or lead to wrong actions
- Examples: job status, recent activity feeds, real-time collaboration state

## Cache invalidation

Presets define passive cache behavior for navigation. When a user explicitly changes data, mutations should invalidate the relevant queries rather than relying on staleTime to eventually expire:

```ts
const mutation = trpc.something.update.useMutation({
  onSuccess: () => trpcUtils.something.read.invalidate(),
});
```

## Global defaults

The TanStack QueryClient is configured with `standard` values as the application default. Presets only need to be applied where you want to deviate from that.
