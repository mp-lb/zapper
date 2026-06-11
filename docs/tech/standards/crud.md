# Data Modeling with Zod

## Core Principles

These principles apply to all data modeling in the application, whether you're using the CRUD pattern or not:

### 1 Single Source of Truth

Define your schema once in Zod and derive everything else from it. Never write TypeScript types manually when you have a Zod schema.

```
// ✅ Good: Define schema, derive type
export const userSchema = z.object({ name: z.string() });
export type User = z.infer<typeof userSchema>;

// ❌ Bad: Duplicate definitions
export const userSchema = z.object({ name: z.string() });
export type User = { name: string }; // Don't do this!
```

### 2 Always Derive Types from Schemas

Export types from where schemas are defined, then import and use those derived types throughout your codebase (frontend, backend, client code).

```
// schemas/user.ts
export const userSchema = z.object({ name: z.string() });
export type User = z.infer<typeof userSchema>;

// frontend/UserProfile.tsx
import { User } from '@/schemas/user';
// Use the derived type, never redefine it
```

### 3 Zod Responsible for Object Creation and Validation

Use Zod schemas to validate and create objects, ensuring consistency at every layer.

```
export const createUser = (data: UserCreate): User => {
  return userSchema.parse({
    ...data,
    ...createBasicFields(),
  });
};
```

### 4 Use String UUIDs for IDs

Use `crypto.randomUUID()` for `_id` fields instead of MongoDB ObjectIds. This keeps the type consistent across backend and frontend, eliminating `.toString()` conversions.

### 5 Use Defaults Liberally

Add default values for most fields unless they're absolutely required for record creation. This avoids null/undefined throughout your application.

- Strings should default to `""` (empty string)
- Arrays should default to `[]` (empty array)
- Numbers should default to `0` or another sensible default
- Only use `null` or `undefined` when they encode special meaning or when there's no sensible default

```
// ✅ Good: Sensible defaults
export const profileSchema = z.object({
  bio: z.string().default(""),
  tags: z.string().array().default([]),
  score: z.number().default(0),
});

// ❌ Bad: Everything nullable
export const profileSchema = z.object({
  bio: z.string().nullable(),
  tags: z.string().array().nullable(),
  score: z.number().nullable(),
});
```

## The CRUD Pattern

The CRUD pattern works great when your read and write models are essentially the same - simple data models where you create, read, update, and delete records without significant transformation between input and storage.

### When to Use CRUD

Use this pattern when:

- Your read model and write model have the same shape
- There's minimal processing between user input and storage
- You're dealing with straightforward data entities (users, posts, comments, etc.)
- Sub-documents and embedded models (these can work with extended CRUD)

### CRUD Implementation

The goal is to define your model's fields once and derive every CRUD shape from that single source of truth. This avoids duplication, keeps read/write/update logic perfectly in sync, and ensures both TypeScript and Zod validate data consistently at every layer.

```
// basicFields.ts

export const basicFields = z.object({
  _id: z.string().default(() => crypto.randomUUID()),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  deletedAt: z.date().nullable().default(null),
});

export const createBasicFields = () => ({
  _id: crypto.randomUUID(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});
```

```
// book.ts

export const bookCoreSchema = basicFields.extend({
  title: z.string(),
  author: z.string(),
  price: z.number(),
  category: z.string(),
  tags: z.string().array(),
});

export const bookCoreWithDefaultsSchema = bookCoreSchema.extend({
  category: bookCoreSchema.shape.category.default(""),
  price: bookCoreSchema.shape.price.default(0),
  tags: bookCoreSchema.shape.tags.default([]),
});

export const bookSchema = bookCoreWithDefaultsSchema.extend(basicFields.shape);
export const bookCreateSchema = bookCoreWithDefaultsSchema;

export const bookUpdateSchema = bookCoreSchema
  .partial()
  .extend({ _id: z.string() });

export type BookCreate = z.input<typeof bookCreateSchema>;
export type BookUpdate = z.input<typeof bookUpdateSchema>;
export type Book = z.infer<typeof bookSchema>;

export const createBook = (data: BookCreate, userId: string): BookBase => {
  return bookBaseSchema.parse({
    userId,
    ...bookCreateSchema.parse(data),
    ...createBasicFields(),
  });
};
```

## When NOT to Use CRUD

The CRUD pattern doesn't fit every scenario. Don't force it when:

### CQRS-Style Architectures

When your read model looks significantly different from your write model. For example:

- Write model accepts raw input that needs processing
- Read model includes computed fields, aggregations, or joined data
- Different validation rules for input vs. output

### Read-Only Models

When data is created by the system, not by users:

- LLM responses from AI services
- Data fetched from third-party APIs
- Computed aggregations or analytics
- System-generated reports

### Complex Processing Between Input and Storage

When significant transformation happens between what the user sends and what gets stored:

- Password hashing (input: password, storage: passwordHash)
- File uploads (input: file, storage: URL + metadata)
- Multi-step workflows with intermediate states

### When to Extend CRUD

Some scenarios can still work with an extended CRUD pattern:

- **Sub-documents**: Nested objects can use CRUD with proper schema composition
- **Embedded models**: Arrays of objects can be handled with Zod's array methods
- **Soft deletes**: Adding `deletedAt` timestamps fits naturally into CRUD

## Alternative Patterns

When CRUD doesn't fit, you still follow the core principles: Zod schemas as the single source of truth, derived types, and validation at every layer.

### Pattern 1: Read-Only Models

For data that comes from external sources (LLMs, third-party APIs, system computations), you only need a read schema and validation.

```
// llmResponse.ts - data from external LLM service

export const llmResponseSchema = z.object({
  _id: z.string(),
  prompt: z.string(),
  completion: z.string(),
  model: z.string(),
  tokens: z.number(),
  createdAt: z.date(),
});

export type LLMResponse = z.infer<typeof llmResponseSchema>;

// Validate external data coming in
export const createLLMResponse = (rawData: unknown): LLMResponse => {
  return llmResponseSchema.parse(rawData);
};
```

**Key points:**

- No create/update schemas needed
- Zod validates data from external sources
- Type is still derived from schema
- Schema is still responsible for object creation/validation

### Pattern 2: CQRS-Style Separate Models

When reads and writes are fundamentally different, define separate schemas for commands (writes) and views (reads).

```
// userCommand.ts - what we accept from client

export const userCommandSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string(),
  lastName: z.string(),
});

export type UserCommand = z.infer<typeof userCommandSchema>;
```

```
// userView.ts - what we return to client

export const userViewSchema = z.object({
  _id: z.string(),
  email: z.string(),
  fullName: z.string(), // computed from firstName + lastName
  profileImageUrl: z.string(),
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
});

export type UserView = z.infer<typeof userViewSchema>;
```

```
// userModel.ts - internal storage representation

export const userSchema = basicFields.extend({
  email: z.string(),
  passwordHash: z.string(), // not password!
  firstName: z.string(),
  lastName: z.string(),
  profileImageUrl: z.string().default(""),
});

export type User = z.infer<typeof userSchema>;

// Transform command to storage model
export const createUserFromCommand = (command: UserCommand): User => {
  const passwordHash = hashPassword(command.password);
  
  return userSchema.parse({
    email: command.email,
    passwordHash,
    firstName: command.firstName,
    lastName: command.lastName,
    ...createBasicFields(),
  });
};

// Transform storage model to view
export const createUserView = (user: User): UserView => {
  return userViewSchema.parse({
    _id: user._id,
    email: user.email,
    fullName: `${user.firstName} ${user.lastName}`,
    profileImageUrl: user.profileImageUrl,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
};
```

**Key points:**

- Three separate schemas: command (input), model (storage), view (output)
- Each schema has its own derived type
- Transformation functions between layers
- Zod validates at each boundary

## Key Takeaways

Regardless of whether you use CRUD or alternative patterns, always follow these principles:

### ✅ DO

- **Define schemas once in Zod** - Single source of truth for all data shapes
- **Derive types from schemas** - Use `z.infer<typeof schema>` or `z.input<typeof schema>`
- **Export types from schema files** - Make them available throughout your codebase
- **Import and use derived types** - In frontend, backend, and client code
- **Use Zod for validation** - At every boundary (API inputs, external data, database writes)
- **Use Zod for object creation** - Let schemas handle defaults and validation
- **Add sensible defaults** - Prefer empty strings/arrays over null/undefined

### ❌ DON'T

- **Never write types manually** - If you have a Zod schema, derive the type
- **Never duplicate type definitions** - One schema, one type, exported once
- **Never skip validation** - Use Zod's `.parse()` at boundaries
- **Don't force CRUD** - Use alternative patterns when reads/writes differ significantly

### Example: The Anti-Pattern

```
// ❌ BAD: Duplicate definitions
// schemas/user.ts
export const userSchema = z.object({
  name: z.string(),
  email: z.string(),
});

// types/user.ts - DON'T DO THIS!
export type User = {
  name: string;
  email: string;
};

// ✅ GOOD: Single source of truth
// schemas/user.ts
export const userSchema = z.object({
  name: z.string(),
  email: z.string(),
});

export type User = z.infer<typeof userSchema>;

// frontend/UserProfile.tsx
import { User } from '@/schemas/user';
```

**Remember:** Zod schemas are not just for validation - they're your single source of truth for data shapes, types, defaults, and object creation across your entire application.