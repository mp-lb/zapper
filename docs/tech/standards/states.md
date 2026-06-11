# UI States

UI state should be consistent, predictable, and mostly handled by shared primitives. Do not invent local loading, error, empty, pending, or feedback patterns unless the standard pattern cannot describe the state clearly.

This guide assumes React, TanStack Query, React Suspense, shadcn/ui, and sonner.

## Principles

- Use the highest useful boundary for loading and errors.
- Keep the app shell stable whenever possible.
- Treat empty data, failed data, pending work, and completed work as separate states.
- Show feedback for API failures unless the caller has a deliberate reason not to.
- Use inline UI only for states that remain true after the request completes.
- Use toasts for point-in-time events.
- Prefer shared primitives over one-off UI.

## Standard Primitives

Use the shared components for common states:

- `LoadingState` for route, page, and panel loading.
- `ErrorState` for failures and not-found cases.
- `EmptyState` for successful requests with no data to show.
- Button/control pending state for user-triggered actions.
- Sonner toasts for transient feedback.
- Root and page error boundaries for render failures.

`EmptyState` and `ErrorState` share the same layout pattern: icon, title, description, and optional action. Product-specific copy belongs at the call site.

## Loading

Use Suspense or route/page-level query coordination for page data. The usual shape is:

- App shell remains mounted.
- Page content has one loading state.
- Independent panels may have independent loading states.
- Mutations show pending state on the triggering control.

Avoid scattered spinners for the same page load. Split loading boundaries only when the regions are independently useful.

Skeletons are optional. Use them only when they preserve layout simply and clearly. A centered spinner is the default.

## Errors

Choose error UI by asking what is currently unusable.

- If the route cannot render, use the route/page error boundary or a page-level `ErrorState`.
- If a panel cannot render but the rest of the page is useful, use a panel-level `ErrorState`.
- If a form submission fails and the user can correct or retry in place, use an inline `ErrorState`.
- If a selected or routed thing does not exist or is no longer accessible, use `ErrorState` in the page, panel, or detail region where that thing would have appeared.
- If a background refresh, automatic request, or row action fails while useful data remains on screen, use a toast.

Inline alerts must have a clear exit condition: a retry, a new search, a form edit, a route change, or the failed content being replaced. Do not leave a persistent inline alert for a point-in-time failure after the UI has recovered or still has cached data.

Do not show both an inline error and a toast for the same expected failure unless there is a strong product reason. Form-style failures usually want inline feedback. Point-in-time action failures usually want a toast.

If you change error shapes, API error contracts, or error translation, read [errors.md](./errors.md).

## Empty States

An empty state means the request succeeded and there is no data to show. It is not an error.

Use `EmptyState` when a page, panel, list, or table has no rows after a successful load. The copy should explain the state that matters to the user: no records, no matches, no access, or setup incomplete.

Add an action only when there is a natural next step the user can actually complete.

## Toasts

Toasts are for transient events, especially events that do not have a stable place in the layout.

Use toasts for:

- Failed point-in-time actions.
- Background refresh failures.
- Successful destructive or high-consequence actions.
- Long-running operations as they move through meaningful states.

Do not use toasts for:

- Field validation that belongs next to an input.
- Page or panel failures that replace content.
- Every minor successful update when the UI already reflects the change.

Toasts should be short and actionable. They should not contain raw exception details.

## Mutations

Mutation state belongs at the point of action.

- Disable or mark the triggering control pending while the mutation is in flight.
- Prevent duplicate submissions unless the operation is intentionally idempotent.
- Use optimistic updates only when rollback is straightforward.
- On failure, roll back optimistic UI and show either inline feedback or a toast according to the error rules above.
- On success, update or invalidate the relevant query data.

## Boundaries

Use boundaries to match the user's mental model:

- Root boundary: app bootstrap and catastrophic failures.
- Route/page boundary: current page failures.
- Page suspense/loading boundary: page-level data.
- Panel boundary: independent page regions.

Do not wrap every component in its own boundary. Too many boundaries create fragmented pages and unclear ownership.

Modals follow the same rules. Their content may need loading, empty, error, pending, and toast feedback, but the decision rules do not change. See [modal-layer.md](./modal-layer.md) for modal-specific behavior.

## Copy

State copy should be direct, specific, and short.

- Loading copy is usually unnecessary.
- Error copy should say what failed and, when useful, what the user can do next.
- Empty copy should explain why there is nothing to show.
- Toast copy should fit in one short sentence.

Avoid raw exception messages, stack traces, implementation details, and vague copy when the failed operation is known.

## Default Decision Rule

When adding state UI, choose the first rule that applies:

1. The route or panel cannot render: `ErrorState` or boundary fallback.
2. The request succeeded but there is no data: `EmptyState`.
3. A form or editable surface failed and remains actionable: inline `ErrorState`.
4. A point-in-time action or background request failed: toast.
5. Work is in progress: pending state at the smallest useful scope.

If none of these fit, prefer a shared primitive and document why the state needs different treatment.
