# Layout Principles

Components render content. Layout containers control spacing, sizing, and scrolling.

## 1. Layout owns spacing

Do not use margins between sibling components.

Use `gap` on the parent container instead.

Good:

```html
<div class="flex flex-col gap-4">
  <Card />
  <Card />
  <Card />
</div>
```

Bad:

```html
<Card class="mb-4" />
```

Using `gap` keeps layouts resilient when items reorder, disappear, or render conditionally.

---

## 2. Build layouts from simple primitives

Most layouts are combinations of a few patterns:

- Vertical stack
- Horizontal row
- Fill layout
- Centered container

Examples:

```html
flex flex-col gap-4
flex items-center gap-2
flex-1 min-h-0
items-center justify-center
```

Keep layout predictable and composable.

---

## 3. Layouts should fill available space

App layouts should expand to fill their container and isolate scrolling to the intended region.

```html
<div class="flex h-screen">
  <aside class="w-64 shrink-0" />

  <main class="flex-1 min-w-0 min-h-0 overflow-auto">
    ...
  </main>
</div>
```

Key utilities:

- `flex-1`
- `min-w-0`
- `min-h-0`
- `overflow-auto`

Avoid hardcoded heights whenever possible.

---

## 4. Components should be layout-agnostic

Components should not control:

- Outer spacing
- Page structure
- Scroll behavior
- Parent layout

Those concerns belong to the layout container.

A component should work the same way regardless of where it is placed.

---

## 5. Prefer composition over custom CSS

Before writing custom CSS, ask:

- Is this just flexbox?
- Is this just gap?
- Is this just grow/shrink?
- Is this just overflow management?

Most layouts should emerge from composing simple, reusable rules.

---

# Common Anti-Patterns

- Margins between sibling components
- Hardcoded heights
- Nested scroll containers
- Layout logic inside content components
- One-off layout CSS for common patterns

