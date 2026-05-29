# Optimistic Updates with TanStack React Query

Optimistic updates make the UI update immediately before the server confirms a mutation. If the request fails, the UI rolls back to the previous cache state.

TanStack Query supports this with `useMutation`, `onMutate`, `setQueryData`, rollback context, and `invalidateQueries`. ([tanstack.com](http://tanstack.com))

## Reusable Hook

```ts
import {
  QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

type OptimisticMutationOptions<TData, TVariables, TQueryData> = {
  queryKey: QueryKey
  mutationFn: (variables: TVariables) => Promise<TData>
  updateCache: (oldData: TQueryData | undefined, variables: TVariables) => TQueryData
}

export function useOptimisticMutation<TData, TVariables, TQueryData>({
  queryKey,
  mutationFn,
  updateCache,
}: OptimisticMutationOptions<TData, TVariables, TQueryData>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })

      const previousData = queryClient.getQueryData<TQueryData>(queryKey)

      queryClient.setQueryData<TQueryData>(queryKey, (oldData) =>
        updateCache(oldData, variables),
      )

      return { previousData }
    },

    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previousData)
    },

    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey })
    },
  })
}
```

## Example Usage

```ts
const createTodo = useOptimisticMutation({
  queryKey: ['todos'],
  mutationFn: async (newTodo: Todo) => {
    return api.todos.create(newTodo)
  },
  updateCache: (oldTodos = [], newTodo) => {
    return [...oldTodos, newTodo]
  },
})
```

```tsx
<button onClick={() => createTodo.mutate({ id: crypto.randomUUID(), text })}>
  Add todo
</button>
```

## Purpose

Use this hook to make mutations feel instant while keeping React Query as the source of truth.

## When to Use It

Use optimistic updates when:

- the mutation is likely to succeed
- the expected result is easy to predict
- the UI should feel instant
- rollback is acceptable if the request fails

## When Not to Use It

Avoid optimistic updates when:

- the server response is hard to predict
- permissions or validation often fail
- the mutation has serious side effects
- rollback would confuse the user
- multiple users may edit the same data at once

## Gotchas

- Always cancel matching queries before updating the cache, or a refetch can overwrite your optimistic state.
- Always snapshot previous cache data so you can roll back.
- Always invalidate after the mutation settles so the cache syncs with the server.
- Be careful with temporary IDs. Replace them with server IDs after refetch or mutation success.
- Keep `updateCache` pure. Do not mutate `oldData` directly.
- Make sure your query key matches the query you want to update.
- Concurrent mutations can conflict. For complex cases, you may need more specific query keys or custom reconciliation logic.
- Do not hide errors. If rollback happens, show the user that the action failed.

## Rule of Thumb

Optimistic updates are best when the user already expects the action to succeed and the UI state is easy to undo.