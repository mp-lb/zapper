# Regenerating Token Buckets

A regenerating token bucket is a good fit for in-app currency, credits, energy, quota, and other resources that refill over time up to a maximum. Do not refill these resources with cron jobs. Store the last authoritative bucket state, then recalculate the live balance whenever the user reads or spends from it.

The UI may show a live, smoothly regenerating balance, but that value is only a projection. The server remains authoritative.

## Model

Store one row or document per actor and bucket:

Example shape for tokens:

- `tokens`: balance as of `lastTokenUpdate`
- `lastTokenUpdate`: authoritative timestamp
- `tier`: derives free/pro capacity and refill rate

Keep the server and client formulas shared when possible. If they cannot literally share code, keep constants named the same and test both paths against the same examples.

## Formula

To settle a bucket:

```ts
const getSettledBalance = (bucket: Bucket, now: Date): number => {
  const elapsedMs = now.getTime() - bucket.updatedAt.getTime();
  const regenerated = (elapsedMs / bucket.regenIntervalMs) * bucket.regenAmount;
  return Math.min(bucket.maxBalance, bucket.balance + Math.max(0, regenerated));
};
```

To spend from a bucket:

```ts
const spendFromBucket = (bucket: Bucket, cost: number, now: Date): Bucket => {
  const settledBalance = getSettledBalance(bucket, now);

  if (settledBalance < cost) {
    throw new Error("Not enough tokens");
  }

  return {
    ...bucket,
    balance: settledBalance - cost,
    updatedAt: now,
  };
};
```

Use server time for `now` on all writes. Do not trust a client-provided timestamp for authoritative state.

## Server Writes

Every action that consumes tokens must settle and spend in one authoritative write path:

1. Load the current bucket.
2. Calculate the settled balance from `balance`, `updatedAt`, and server `now`.
3. Reject if the settled balance is below the action cost.
4. Persist `balance = settledBalance - cost` and `updatedAt = now`.
5. Return the updated bucket or invalidate/refetch the query that owns it.

Protect this operation from concurrent double-spend. Use the strongest primitive the data store supports:

- SQL: transaction with `SELECT ... FOR UPDATE`, or an atomic `UPDATE` guarded by the current version.
- MongoDB: transaction, optimistic version field, or conditional update that only succeeds when the document version/timestamp still matches the loaded document.
- Redis: Lua script or transaction.

Do not implement spend as an unguarded read followed by an unconditional update when multiple requests can hit the same bucket. Two simultaneous spends can both observe the same balance and overspend.

New buckets should be initialized by the same code path. If the actor has no bucket yet, create one with the starter balance minus the current action cost, or create the starter bucket before allowing spend actions.

## Reads

Read APIs may return the stored bucket state without constantly writing regenerated balances back to storage. The client can project the live value from:

- `balance`
- `updatedAt`
- `maxBalance`
- `regenRate`

Only write when there is a meaningful state transition: spend, grant, tier change, admin adjustment, purchase, or explicit reset.

If a read endpoint returns a precomputed `currentBalance`, also return the raw bucket fields. UI timers still need a stable base timestamp and balance.

## UI Projection

The UI may show a fake live balance by applying the same formula locally on an interval:

```ts
const getProjectedBalance = (bucket: Bucket, nowMs = Date.now()): number => {
  const elapsedMs = nowMs - new Date(bucket.updatedAt).getTime();
  const regenerated = (elapsedMs / bucket.regenIntervalMs) * bucket.regenAmount;

  return Math.min(bucket.maxBalance, bucket.balance + Math.max(0, regenerated));
};
```

This projection is for display only. It can drift if:

- the user changes their system clock
- another device spends from the same bucket
- a background refetch is delayed
- tier/rate/capacity changes server-side
- local constants differ from server constants

Refetch periodically or after relevant mutations so the projection gets a fresh authoritative base.

Display integer balances with `Math.floor(projectedBalance)` when fractional regeneration exists. Keep the fractional value in state so the visible number advances at the right time.

## Errors

Map insufficient balance to a typed application error. Do not expose generic database or arithmetic failures to the UI as "out of tokens."

Recommended shape:

- Server throws a typed error such as `OUT_OF_TOKENS`.
- tRPC procedure maps it to a stable code, commonly `TOO_MANY_REQUESTS` when the bucket is a rate or quota boundary.
- UI shows a product-specific message and disables or redirects the action when appropriate.

For Doctrine, follow [errors.md](./errors.md) for the exact error envelope.

## Tier Changes

When capacity or refill rate changes, settle the old bucket first using the old rules, then apply the new rules:

1. Calculate balance at server `now` with the previous tier/rate/capacity.
2. Change tier/rate/capacity.
3. Clamp the settled balance to the new maximum if needed.
4. Persist the new balance and `updatedAt = now`.

This prevents upgrades, downgrades, and admin changes from accidentally granting or deleting time-based regeneration.

## Tests

At the procedure or domain boundary, cover:

- no existing bucket initializes correctly
- spend below, equal to, and above the settled balance
- regeneration clamps at max capacity
- fractional regeneration is preserved
- old timestamps settle correctly
- future timestamps do not produce negative regeneration
- concurrent spend cannot double-spend
- tier changes settle using the old tier before applying the new one
- UI projection matches server settlement for fixed inputs

Use fixed timestamps in tests. Do not depend on real time.

## Rule of Thumb

The stored balance is true only at `updatedAt`. The live balance is a deterministic projection from that point. Server writes settle and persist reality; UI reads animate an estimate until the next authoritative response arrives.
