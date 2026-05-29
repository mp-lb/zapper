# TypeScript Coding Guidelines

These guidelines optimize for clarity, minimal concepts, and low cognitive load. We favor few strict rules, followed consistently.

---

## 2 Files &amp; Exports

- One primary function per file
  - Exceptions: simple lists, pure data maps, or trivial wrappers
- Use `export const` exclusively
  - No `export default`
  - Enforces consistent naming and imports
- Files are named directly after the thing they export
  - No suffixes like `.model.ts`, `.service.ts`, etc.
- All imports must be declared at the top of the file except for intentional circular-dependency or platform guards

---

## 3 Function Size &amp; Complexity

- Functions should generally:
  - Fit in one editor view (~60 lines max)
  - Do one logical thing
- Measure by complexity, not line count
  - A 100-line switch is fine
  - A few nested loops/conditionals is already "too complex"
- Avoid:
  - Deep nesting
  - Defining functions inside functions (except when strictly required, e.g. hooks)

Small functions force good decomposition and natural modularity.

---

## 4 Code Organization

- Organize by feature/slice, not by type
  - Avoid generic folders like `utils`, `services`, `components` at the top level
- Co-locate related logic:
  - If a component is only used by its parent, it lives with its parent
- Only introduce deeper folder structure when a folder becomes meaningfully large (≈10+ files)
- The folder structure should "scream" what the system does at a glance and the filetree should echo the real structure of your program

> Some exceptions can be made for super ubiqtuitous conventions and tools like NextJS and shadcn/ui patterns.

### Component Folders

For big components, use a folder structure with `index.ts`:

```
/SomeComponent
  index.ts        // export { SomeComponent } from "./SomeComponent"
  SomeComponent.tsx    // the actual component
```

See ./component-decomposition.md for more.

---

## 5 Naming

- Names should be:
  - As long as necessary
  - No longer than needed
- Never repeat obvious context
  - Directory and module already provide most of the meaning
- Functions are always verbs
  - `openModal`, `updateName`, `fetchUser`
  - Avoid: `onClick`, `handleChange`
- Avoid vague prefixes like `handle`, `manage`

### Booleans

- Use `is`, `has`, `can`, `will` only when short and clarifying
  - `isOpen`, `hasAccess` ✅
  - Overly long grammatical constructions ❌

---

## 6 Constants

Reserve ALLCAPS for true real-world invariants like `PI`, `SECONDS_PER_DAY`. Everything else follows normal naming rules.

---

## 7 React-Specific Conventions

- Treat React components as just functions
- Handler naming:
  - Name by what they do, not how they’re triggered
  - Prefer: `updateName`, `openDialog`
  - Avoid: `onClickName`, `handleChange`
- If `setX` already exists:
  - Use a verb like `updateX` for richer logic
- Controlled components:
  - Props reflect behavior, not wiring (`value`, `onChange` as behavior, not "handlers")

