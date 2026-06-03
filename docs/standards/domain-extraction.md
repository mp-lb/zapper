# Domain Extraction

Most features should stay ordinary: validate input, load data, call small helpers, write to the database, and return a shaped response. Extract a domain only when the logic has become dense enough that leaving it inside tRPC procedures, services, or UI components makes the system harder to understand.

Domain extraction means moving a difficult, self-contained problem into a focused package with a narrow public API, strong tests, and clear ownership of its invariants. This follows the same modular-monolith instinct as [Modular Monolith Architecture](./modular-monolith.md), but is specifically for hard domain logic rather than every product area.

## When to Extract

Extract when a feature has real internal complexity, especially if it includes:

- Trees, graphs, traversal, recursive lookup, or nested references.
- Sync planning, conflict resolution, merge behavior, or replayable operations.
- Permission, visibility, or access rules that must stay consistent everywhere.
- Opaque structures stored in MongoDB that should only be interpreted by one owner.
- Repeated algorithms or subtle invariants appearing in multiple procedures or components.

Do not extract basic CRUD, simple query shaping, formatting helpers, or one-off logic that has not yet shown real complexity.

## Package Boundary

The extracted package owns the domain model, schemas, pure operations, and invariants. Code outside the package should call its public API instead of reimplementing domain rules.

Keep the boundary small:

- Export named operations that match domain tasks.
- Hide internal structures unless callers truly need them.
- Keep browser-safe logic browser-safe so the frontend can use it when useful.
- Split server-only adapters from pure logic when the domain needs database, filesystem, or network access.

## App Boundary

tRPC procedures and services should orchestrate. They validate input, load records, call the domain package, persist results, log important events, and return the response. They should not contain the domain algorithm itself.

If MongoDB stores an opaque domain-owned structure, the app may persist and retrieve it, but mutation and interpretation should go through the package.

## Testing

The extracted package should have dense tests for the domain behavior: edge cases, invariants, and awkward states. tRPC procedure tests should then prove the app boundary is wired correctly.

The goal is a simpler app and a more reliable domain: hard logic becomes easier to see, easier to test, and harder to accidentally duplicate.
