# Event schema

Events (this includes logs) should conform to this shape, **extra fields are also allowed**. Think of this is more of an informal structure guide for common fields on event records.

```
interface Event {
  id?: string; // UUID for the event itself
  eventType: string; // <domain>.<action>[.<state>] e.g. auth.login.failed
  module?: string; // Code module, can be anything, used to group relevant logs.
  message?: string; // Optional human readable message.
  timestamp?: string; // ISO formatted datetime.
  userId?: string; // Events aren't strictly associated with a user but in most cases events can be attributed to a user.
  source?: {
    module?: string; // Code module that created the event, e.g. class/package
    platform?: string; // For client events. web, desktop, ios, android, chrome-extension.
    env?: "development" | "staging" | "production";
    service?: string; // For server events.
    os?: string;
    version?: string; // App version or commit hash.
    user_agent?: string;
  };
  http?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    route?: string;
    status?: number;
  };
  trace?: {
    traceId?: string;
    spanId?: string;
    parentEventId?: string;
  };
  actor?: {
    id?: string;
    type?: string;
    role?: string;
  };
  details?: Record<string, unknown>; // Any other details related to the particular event type.
}

```

## Event type

`eventType` should describe an externally observable fact, not internal decision logic. If more than one word is needed to describe the “state”, that information belongs in details, not in the event name.

## Details

`details` is the primary carrier of event-specific data and may evolve independently of eventType; changing business logic should prefer extending details over introducing new event names. It should have a version number when the schema matters. This is not covered by this spec but important to keep in mind.

### 3rd party adapters

This schema represents the canonical event shape used in application code; storage, observability, and analytics tools may impose their own schemas, which should be adapted to and from this format rather than redefining event meaning.