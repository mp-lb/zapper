# Formatting

Formatting is a presentation concern. The database and API should store and return raw values; the frontend should convert those values into user-facing strings at the last responsible moment.

This keeps storage stable, API contracts predictable, and UI formatting consistent.

## Core Rule

Store canonical data. Format at the edge.

Examples:

- Store timestamps as UTC instants, not pre-formatted date strings.
- Store numbers as numbers, not strings with commas, symbols, or rounded precision.
- Store names as structured fields where possible, not display labels only.
- Store enum-like values as stable machine values, not translated or decorated labels.

The API may normalize or serialize data, but it should not make view-specific formatting decisions.

## Frontend Formatter

Shared frontend formatting lives in one obvious module:

```typescript
// apps/frontend/src/lib/format.ts
export const f = {
  date: {
    relative: formatRelativeDate,
    human: formatHumanDate,
    technical: formatTechnicalDate,
  },
  name: {
    normal: formatNormalName,
    initials: formatInitials,
  },
  number: {
    compact: formatCompactNumber,
    decimal: formatDecimalNumber,
    integer: formatInteger,
  },
};
```

Components call formatters directly:

```typescript
f.date.relative(user.createdAt);
f.name.initials(user);
f.number.compact(matter.value);
```

This gives components a small, consistent vocabulary for display decisions and makes formatting easy to audit.

## What Belongs Here

Use `format.ts` for reusable display transformations:

- Dates and times
- Relative times
- Numbers, currencies, and percentages
- Names and initials
- Addresses or address fragments
- Phone numbers
- File sizes
- Status labels when they are pure display labels

Do not use `format.ts` for:

- Parsing user input
- Validation
- Database normalization
- Business rules
- Permission-specific display decisions
- Component-specific sentence construction

If a formatter needs application state, permissions, network data, or complex domain branching, it is probably not a formatter.

## Naming

Prefer names that describe the output style, not the implementation.

Good:

```typescript
f.date.relative(createdAt); // "3 minutes ago"
f.date.human(createdAt); // "3 June 2026"
f.date.technical(createdAt); // "2026-06-03 14:30 UTC"
```

Avoid:

```typescript
f.date.dateFnsFormatA(createdAt);
f.date.shortish(createdAt);
f.date.format1(createdAt);
```

Use a small number of named formats. If two formats are almost the same, prefer one shared format unless the product has a real need for both.

## Dates And Times

Dates are the easiest place to create accidental inconsistency.

Rules:

- Treat API timestamps as UTC instants.
- Make timezone behavior explicit inside the formatter.
- Use `Intl.DateTimeFormat` unless there is a clear reason to add a date library.
- Keep relative time wording centralized.
- Avoid calling `toLocaleString` directly in components.

Example categories:

```typescript
f.date.relative(value); // "3 seconds ago", "yesterday"
f.date.human(value); // "3 June 2026"
f.date.technical(value); // "2026-06-03 14:30 UTC"
f.time.human(value); // "14:30"
```

If a screen needs a special one-off format, start by asking whether it is really a new product-wide format. If yes, add it to `f`. If no, keep it local to the component.

## Locale And Timezone

Formatters should be deterministic enough to test and predictable enough to reason about.

For now, prefer project defaults inside `format.ts` rather than passing locale and timezone through every component. If the product later supports per-user locale or timezone, add that as a small formatting context rather than scattering `Intl` options across components.

Example future shape:

```typescript
const f = createFormatter({
  locale: user.locale,
  timeZone: user.timeZone,
});
```

Do not introduce that abstraction before it is needed.

## Implementation Guidelines

Formatters should be:

- Pure: same input and options produce the same output.
- Small: one display decision per function.
- Total where practical: handle `null` or `undefined` intentionally, either by returning a fallback or by rejecting those inputs at the type level.
- Boring: use platform APIs and clear names before clever abstractions.

For expensive formatters, define reusable `Intl.*Format` instances at module dashboardview rather than constructing them on every render.

```typescript
const humanDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
```

## Type Boundaries

Be explicit about what each formatter accepts.

If API values arrive as ISO strings, formatter inputs should accept ISO strings. If the tRPC client preserves `Date` objects, formatter inputs should accept `Date`. Avoid accepting every possible date shape unless the formatter is deliberately normalizing those shapes.

Good:

```typescript
const formatHumanDate = (value: string) => {
  const date = new Date(value);
  return humanDateFormatter.format(date);
};
```

Less good:

```typescript
const formatHumanDate = (value: string | number | Date | null | undefined) => {
  // Harder to reason about and easier to misuse.
};
```

## Relationship To Backend Code

Backend code may still have serialization helpers, logging formatters, and normalization logic. Those are not user-facing formatters and should not use the frontend `f` object.

Shared browser-safe raw data helpers belong in `packages/core`. User-facing display formatting belongs in the frontend unless there is a concrete need to share it across multiple frontends.

If a formatter becomes shared across projects, extract it deliberately as a browser-safe package with no React dependency.

## Review Checklist

When reviewing UI code, check:

- Are raw API values being formatted in components with `f.*`?
- Are components avoiding ad hoc `toLocaleString`, `Intl`, string slicing, and rounding?
- Is the formatter name clear from the call site?
- Is timezone behavior intentional?
- Is this a reusable product format, or should it stay local?
- Are raw values still available for sorting, filtering, and API writes?