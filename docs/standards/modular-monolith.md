# Modular Monolith Architecture

## Philosophy

This codebase follows a **modular monolith** pattern. Each domain (customers, orders, messaging, etc.) lives in its own package as an independent, self-contained module. All modules currently run together in a single backend process, but they're designed so that any module could be extracted to run as a separate microservice with minimal changes.

The key principle: **modules are microservice-ready**. We get the simplicity of a monolith (single deployment, no network hops between modules, easy debugging) while preserving the option to scale out specific modules later. If a module becomes resource-intensive or needs independent scaling, you detach it from the main backend and run it on its own server—nothing breaks because modules don't depend on each other's internals.

## Purity Principle

All packages are kept **pure**—they have no hidden dependencies on environment, global state, or server-only code. This is enforced through two mechanisms:

1. **Core/Server package split** — Browser-safe code lives in `core`, Node.js-only code lives in `server`. Domain packages use a similar split when needed.

2. **Dependency injection** — Packages don't import the tRPC `t` instance or read environment variables directly. Instead, applications read config and pass dependencies into packages.

This purity means packages work correctly whether imported by the frontend (for types), the backend (for execution), or tests (for isolation).

## Foundational Packages

Two packages form the base layer that all modules build on:

**`@maplab-oss/helloworld-core`** — Browser-safe, environment-agnostic code. Types, constants, schemas, pure functions. Safe to import anywhere including frontend.

**`@maplab-oss/helloworld-server`** — Node.js-only infrastructure. The tRPC `t` instance, logger (pino), database clients. Only imported by backend code.

These foundational packages provide the shared infrastructure that modules plug into. A module imports types from `core` and the `TRPCInstance` type from `server`, then exports a router factory function that the backend calls.

## What is a Module?

A module is a package containing a set of related tRPC procedures and their supporting code. For example, a `customers` module might contain:

```
packages/customers/
├── src/
│   ├── index.ts              # Types, schemas (browser-safe exports)
│   ├── server.ts             # createCustomersRouter factory
│   └── procedures/
│       ├── getCustomer.ts
│       ├── getCustomers.ts
│       ├── createCustomer.ts
│       ├── updateCustomer.ts
│       └── deleteCustomer.ts
└── package.json
```

The module exports a factory function that creates its router:

```typescript
// packages/customers/src/server.ts
import type { TRPCInstance } from "@maplab-oss/helloworld-server";
import { getCustomer } from "./procedures/getCustomer";
import { createCustomer } from "./procedures/createCustomer";

export const createCustomersRouter = (t: TRPCInstance) =>
  t.router({
    get: getCustomer(t),
    create: createCustomer(t),
  });
```

This template repo is too small to have multiple modules—there's just `@maplab-oss/helloworld-trpc` with a single `helloWorld` procedure. But as the application grows, you'd split it into domain-specific modules like `customers`, `orders`, `billing`, etc.

## tRPC Dependency Injection

Modules don't import the `t` instance directly. Instead, they accept it as a parameter:

```typescript
// Each procedure is a function that accepts t
export const getCustomer = (t: TRPCInstance) =>
  t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.collection("customers").findOne({ _id: input.id });
    });
```

**Why?** If a package imports `t` directly from `@maplab-oss/helloworld-server`, it pulls in all of `server`'s dependencies (pino, database drivers, etc.). When the frontend imports types from that package, the bundler tries to include server-only code and fails. By accepting `t` as a parameter, the package stays pure—it only depends on the `TRPCInstance` type, not the actual implementation.

## Backend Composition

The backend is where everything comes together. It imports `t` from `server`, creates each module's router, and composes them:

```typescript
// apps/backend/src/router.ts
import { t } from "@maplab-oss/helloworld-server";
import { createCustomersRouter } from "@maplab-oss/customers";
import { createOrdersRouter } from "@maplab-oss/orders";
import { createBillingRouter } from "@maplab-oss/billing";

export const appRouter = t.router({
  customers: createCustomersRouter(t),
  orders: createOrdersRouter(t),
  billing: createBillingRouter(t),
});
```

The backend also creates the tRPC context, providing shared dependencies (database connections, logger, user session) that all procedures can access via `ctx`.

## Extracting a Module to a Microservice

Because modules are pure and self-contained, extracting one to run separately is straightforward:

1. Create a new backend app (e.g., `apps/billing-service/`)
2. Import `t` from `server` and create only the billing router
3. Set up the tRPC endpoint with the same context shape
4. Update the main backend to proxy billing requests to the new service (or have the frontend call it directly)

The module code doesn't change—it's the same `createBillingRouter` function, just attached to a different backend. This is the power of the modular monolith: you defer the complexity of microservices until you actually need it.

## Frontend Types

The frontend imports only types—no runtime server code:

```typescript
import type { AppRouter } from "@maplab-oss/helloworld-trpc";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: `${baseUrl}/trpc` })],
});
```

This works because packages are pure. The frontend gets full TypeScript inference for all procedures without bundling any server dependencies.
