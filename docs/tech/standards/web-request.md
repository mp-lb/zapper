# Web Request

Use this as a shape reference for the first frontend request. Adapt it to the target framework and client library; do not copy imports literally.

Keep request logic behind a small app-owned boundary:

```tsx
async function fetchItems() {
  const response = await fetch(`${config.apiBaseUrl}/items`);

  if (!response.ok) {
    throw new Error("Unable to load items");
  }

  return response.json();
}
```

Render the visible request states:

```tsx
function ItemsView() {
  const request = useItems();

  if (request.loading) return <p>Loading...</p>;
  if (request.error) return <button onClick={request.retry}>Retry</button>;
  if (request.items.length === 0) return <p>No items yet.</p>;

  return <ItemList items={request.items} />;
}
```

Test at least:

- loading state
- error and retry
- empty result
- successful result
