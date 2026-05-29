# Logging

Logging uses [pino](https://github.com/pinojs/pino) on the backend and a console-based logger on the frontend. Both follow the schema defined in [event-schema.md](./event-schema.md).

## Module Convention

Each app/package has its own logger with a `module` field matching the package name. This aligns with our [modular monolith](./modular-monolith.md) architecture. The frontend is treated as a single module (`module: "frontend"`).

Create a package-level logger by calling `createLogger` once:

```
// packages/some-package/src/logger.ts
import { createLogger } from "@myorg/system";

export const logger = createLogger({ module: "some-package" });
```

Then import and use throughout the package:

```
import { logger } from "./logger";

logger.info("task.completed", { taskId: "123" });
```

## Backend Usage

The logger is available in tRPC context:

```
// log(eventType, details?, meta?)
ctx.logger.info("resource.created", { resourceId: input.id });

// With additional metadata
ctx.logger.info("resource.created", { resourceId: input.id }, { message: "Created new resource" });
```

### Child Loggers

Use `child()` to add extra context for a specific operation:

```
const requestLogger = logger.child({ requestId: "abc-123" });
requestLogger.info("step.completed", { step: 1 });
```

### Log Levels

-   `debug` - Verbose debugging info
    
-   `info` - Normal operations
    
-   `warn` - Unexpected but handled situations
    
-   `error` - Failures requiring attention
    

Set level via `LOG_LEVEL` env var (defaults to `info`).

## Frontend Usage

The frontend has a single logger with `module: "frontend"`:

```
import { logger } from "@/logger";

logger.info("button.clicked", { buttonId: "submit" });
```

## Global Error Handling

Both backend and frontend automatically log uncaught errors.

### Backend

The following are logged automatically:

-   `http.error` - Fastify request errors (via error handler)
    
-   `process.uncaughtException` - Uncaught exceptions
    
-   `process.unhandledRejection` - Unhandled promise rejections
    

### Frontend

The following are logged automatically:

-   `window.error` - Uncaught JavaScript errors
    
-   `window.unhandledRejection` - Unhandled promise rejections
    

These handlers are set up in `main.tsx` and log to the console with stack traces.

## Development

In development, backend logs are formatted with pino-pretty for readability.