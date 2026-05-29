# Component decomposition

Components should be small. But there is an art to breaking down components in a logical way.

To start with you can break down big components into these kinds of things:

- Widgets - they "do a thing", like a picker, a list editor, a menu
- Layouts - they control positioning and whitespace between the children that go into "slots"
- Controllers - they own logic, these are often better described with hooks but there are exceptions
- Hooks - pure logic
- Global stores - like zustand stores, reserved for truly global state and logic

This is the structure of a big component broken down:

```
src/
└── components/
    ├── SomeSharedComponent/
    └── SomeComponent/
        ├── index.ts
        ├── SomeComponent.tsx
        ├── AnotherChildComponent.tsx
        └── SomeChildComponent/
```

And for SomeComponent:

```
// index.ts
export { SomeComponent } from "./SomeComponent"
```

```
// SomeComponent.tsx
import { SomeSharedComponent } from "@/components/SomeSharedComponent"

interface Props {
  foo: string
}

export const SomeComponent = (props: Props) => { ... }
```

## Process

1. Break things down (agressively) into logical pieces
2. Organize the pieces
3. Repeat if necessary

Organization is secondary, breaking things down is really the most important step. It's sometimes helpful to start by breaking it down into a small number of also huge files, and keep doing this recursively.

