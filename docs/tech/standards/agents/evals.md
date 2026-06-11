# Agent Evals

Agent behavior should be covered by local evals.

Use `@mp-lb/tools-evals` for eval run artifacts, file-backed storage, route
handlers, React hooks, and Zap-backed background execution.

## Scope

Add eval coverage for meaningful behavior changes, especially:

- new tools
- prompt changes
- tool selection behavior
- destructive action confirmation
- multi-turn memory
- handoffs
- voice/realtime behavior that delegates to agent tools

## Relationship To Agent Definitions

Evals should exercise the same assumptions as the agent definition:

- prompt parts
- tool definitions
- context/log serialization
- harness-specific parameters

When possible, eval metadata should reference the relevant agent id, prompt
slugs, tools, and harness so failures are easy to inspect.

## Local First

Eval runs should be local-first. Store artifacts in a predictable local location,
run them through Zap tasks, and render them in product/admin screens when useful.

Cloud eval platforms may be added later through adapters, but they should not be
required for normal development.
