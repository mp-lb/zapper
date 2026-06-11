# Event sourcing

Extends `event-schema.md` for events that are the source of truth.

## Event

```ts
type EventSourcedEvent<TPayload = Record<string, unknown>> = {
  id: string;
  eventType: string;
  timestamp: string;
  actor?: {
    id?: string;
    type?: string;
    role?: string;
  };
  trace?: {
    traceId?: string;
    spanId?: string;
    parentEventId?: string;
  };
  aggregate: {
    type: string;
    id: string;
  };
  sequence: number;
  schemaVersion: number;
  payload: TPayload;
  metadata?: Record<string, unknown>;
  correlationId: string;
  causationId?: string | null;
  idempotencyKey?: string;
  recordedAt: string;
};
```

## Storage Constraints

Enforce these at the storage layer:

```ts
unique(event.id);
unique(event.aggregate.type, event.aggregate.id, event.sequence);
uniqueSparse(event.aggregate.type, event.aggregate.id, event.idempotencyKey);
```

`sequence` starts at `1` and increments by `1` per aggregate.

## Stream State

Use either unique sequence inserts or an explicit stream state record. For batch
append, prefer explicit stream state.

```ts
type EventStreamState = {
  aggregate: { type: string; id: string };
  currentSequence: number;
  updatedAt: string;
};
```

Enforce:

```ts
unique(stream.aggregate.type, stream.aggregate.id);
```

## Append API

```ts
type AppendEventsInput = {
  aggregate: { type: string; id: string };
  expectedSequence: number;
  events: Array<
    Omit<EventSourcedEvent, "aggregate" | "sequence" | "recordedAt">
  >;
};

type AppendEventsResult = {
  events: EventSourcedEvent[];
  nextSequence: number;
};
```

Append must be atomic for one aggregate.

For one-event append, this is acceptable:

```ts
insert event with sequence = expectedSequence + 1;
fail on unique(event.aggregate.type, event.aggregate.id, event.sequence);
```

For batch append, use a database transaction:

```ts
update stream
  where aggregate = input.aggregate
  and currentSequence = input.expectedSequence
  set currentSequence = input.expectedSequence + input.events.length;

if updatedCount !== 1:
  reject stale expectedSequence;

insert events with sequences:
  expectedSequence + 1 ... expectedSequence + events.length;

commit;
```

Reject when:

```ts
currentSequence !== expectedSequence;
event.schemaVersion < 1;
!event.eventType.match(/^[a-z]+(?:_[a-z]+)*(?:\.[a-z]+(?:_[a-z]+)*)+$/);
event.schemaVersion !== event.payload.version;
event.correlationId.length === 0;
event.idempotencyKey already produced a different event;
```

## Replay

Replay must validate:

```ts
events[0]?.sequence === 1;
events.every((event, index) => event.sequence === index + 1);
events.every((event) => event.aggregate.type === aggregate.type);
events.every((event) => event.aggregate.id === aggregate.id);
```

## Projection Checkpoint

```ts
type ProjectionCheckpoint = {
  projectionName: string;
  aggregate: { type: string; id: string };
  lastSequence: number;
  lastEventId: string;
  updatedAt: string;
};
```

Projection handlers must be idempotent for the same event id.

## Required Tests

Every event-sourced aggregate must test:

```ts
append starts at sequence 1;
append increments sequence by 1;
append rejects stale expectedSequence;
append deduplicates idempotencyKey;
batch append commits all events or none;
replay rejects gaps;
replay rejects duplicates;
projection can rebuild from events;
append records correlationId;
batch append shares correlationId;
batch append chains causationId;
supported event names match the eventType pattern;
schemaVersion must match payload.version;
```
