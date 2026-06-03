# tRPC Usage Guide

## Overview

This project uses tRPC v11 with TanStack Query v5 for type-safe API calls. Always use tRPC's built-in React Query hooks rather than vanilla TanStack Query hooks directly.

## Package Structure

The `@mp-lb/helloworld-trpc` package has two entry points:

- **`@mp-lb/helloworld-trpc`** - Client-safe exports (types and schemas only). Use this in frontend code.
- **`@mp-lb/helloworld-trpc/server`** - Server-only exports (includes `appRouter`). Use this in backend/worker code only.

This separation prevents server-side tRPC code from being bundled into the frontend.

## Frontend Queries

Use tRPC's `useQuery` hook for data fetching:

```typescript
import { trpc } from "../trpc";

// Basic query
const { data, isLoading, error } = trpc.channels.list.useQuery({ userId });

// Query with options
const { data: sidebar } = trpc.channels.sidebar.useQuery(
  { userId },
  {
    staleTime: 30_000,
    enabled: !!userId,
  }
);

// Custom hook wrapper
export const useSidebar = (userId: string) =>
  trpc.channels.sidebar.useQuery(
    { userId },
    { staleTime: 30_000, enabled: !!userId }
  );
```

## Mutations with Cache Invalidation

### Simple Pattern: onSuccess + Invalidate

For straightforward mutations, use `onSuccess` to invalidate related queries:

```typescript
import { trpc } from "../trpc";

export const BookmarksBar = ({ channelId, userId }: Props) => {
  const utils = trpc.useUtils();

  // Fetch data
  const { data: links = [] } = trpc.links.list.useQuery({ channelId });

  // Mutation with invalidation
  const createLinkMutation = trpc.links.create.useMutation({
    onSuccess: async () => {
      await utils.links.list.invalidate({ channelId });
    },
  });

  const deleteLinkMutation = trpc.links.delete.useMutation({
    onSuccess: async () => {
      await utils.links.list.invalidate({ channelId });
    },
  });

  const handleCreate = () => {
    createLinkMutation.mutate({ channelId, url, title, createdBy: userId });
  };

  return (
    <div>
      {/* UI */}
    </div>
  );
};
```

**Key points:**
- Use `trpc.useUtils()` to access cache utilities
- Call `await utils.query.invalidate()` in `onSuccess`
- Pass query parameters (like `{ channelId }`) to invalidate specific cache entries

### Advanced Pattern: Optimistic Updates

For better UX, implement optimistic updates with rollback on error:

```typescript
const utils = trpc.useUtils();

const createFolderMutation = trpc.folders.create.useMutation({
  onMutate: async (newFolder) => {
    // Cancel outgoing refetches
    await utils.channels.sidebar.cancel({ userId });
    
    // Get current data for rollback
    const previousData = utils.channels.sidebar.getData({ userId });

    // Optimistically update cache
    utils.channels.sidebar.setData({ userId }, (old) => ({
      ...old!,
      folders: [...(old?.folders || []), {
        id: crypto.randomUUID(),
        name: newFolder.name,
        channels: [],
      }],
    }));

    return { previousData };
  },
  onError: (_err, _vars, context) => {
    // Rollback on error
    if (context?.previousData) {
      utils.channels.sidebar.setData({ userId }, context.previousData);
    }
  },
  onSettled: () => {
    // Always refetch after mutation completes
    utils.channels.sidebar.invalidate({ userId });
  },
});
```

**Key points:**
- `onMutate`: Update cache optimistically, return context for rollback
- `onError`: Restore previous data if mutation fails
- `onSettled`: Always invalidate to ensure consistency

## Best Practices

1. **Always use tRPC hooks** - Use `trpc.procedure.useQuery()` and `trpc.procedure.useMutation()`, not vanilla TanStack Query hooks

2. **Invalidate related queries** - After mutations, invalidate affected queries to keep UI in sync

3. **Use optimistic updates for better UX** - Implement `onMutate` + `onError` rollback for frequently used mutations

4. **Await invalidation** - Always `await` the invalidate call to ensure mutations complete properly

5. **Pass query params to invalidate** - Be specific: `utils.links.list.invalidate({ channelId })` instead of `utils.links.list.invalidate()`

6. **Extract custom hooks** - Wrap queries in custom hooks for reusability and cleaner components

