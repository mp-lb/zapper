# Agent Harnesses

A harness is the runtime loop that uses an agent definition.

Examples:

- chat endpoint
- realtime voice session
- background workflow
- scheduled job
- eval runner

The harness is replaceable. The agent definition is the durable source of truth.

## Shared Definitions

When two harnesses represent the same product agent, they should reuse the same
prompts, tools, and context contract where possible.

Harness-specific behavior belongs in conditional prompt parts, adapter code, or
runtime parameters rather than a separate copy of the agent.

For example, a voice harness may add brief spoken-response instructions while
still using the same tools and core product context as a text chat harness.

## Harness Ownership

The consuming application owns:

- request/auth context
- process management
- model provider selection
- streaming behavior
- persistence
- retries and cancellation
- product-specific UI updates

`@mp-lb/tools-agent-framework` should help render and inspect the agent
definition, but it should not force a particular loop.
