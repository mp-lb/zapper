# Errors

We use centralized error handling to prevent accidentally leaking implementation details to the client.

## How it works

All application errors extend a base `AppError` class. Each error type defines a unique `code` property. A top-level error formatter catches any exceptions that bubble up:

-   **AppErrors** are passed through with their code
    
-   **Everything else** becomes a generic `InternalError`
    

This means you (and 3rd party libraries) can freely throw standard JS errors for internal assertions without worrying about what the client sees.

The top-level handler is also a good place to add special cases for common error types from your stack. For example, we handle Zod validation errors (returning field-level issues) and Mongo duplicate key errors at the top level rather than catching them everywhere.

**Don't add try-catch blocks defensively.** The top-level handler already catches everything. Only use try-catch when you intentionally need to transform an error into an AppError or add logging before rethrowing.

## Throwing errors

Import and throw from the relevant package's error types:

```
throw new RecordNotFoundError("patient not found");
throw new InsufficientPermissionsError();

```

## When to create a new error type

Create a new error class when the client needs to handle that case specifically. Each class represents a new error code and something the client can switch on.

If the client just shows a toast regardless of the error type, use an existing generic error. Don't create new types for every failure mode.

## Messages

Messages are optional. Use them to disambiguate when throwing a generic error type:

```
throw new RecordNotFoundError("user not found");
throw new RecordNotFoundError("comment not found");

```

When the error type itself already tells you exactly what went wrong, skip the message:

```
throw new InsufficientPermissionsError();
throw new RateLimitExceededError();

```

Keep messages lowercase and short. A bit of interpolation is fine if it adds useful context.

## Logging

When you catch an error and throw a specific AppError, you must log the original error.

```
try {
  await externalService.call();
} catch (err) {
  console.error(err);
  throw new ExternalServiceError();
}

```