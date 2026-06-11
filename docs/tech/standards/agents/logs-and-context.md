# Agent Logs And Context

Logs are the durable record of agent behavior. Context is the deliberate subset
of logs and runtime state that a harness passes back to the model.

Do not blindly dump the full history into model context. Each agent should have
an explicit context serializer.

## Logs

Agent logs should use the standard event shape in
[event-schema.md](../event-schema.md).

Important agent events include:

- user messages
- assistant messages
- tool calls
- tool results
- tool errors
- approvals and confirmations
- handoffs between agents or harnesses

Logs should be useful both for debugging and for product/admin screens.

## Context Serialization

The context serializer decides what the model sees.

It should preserve:

- the user's current task
- relevant earlier user facts
- relevant tool results
- unresolved questions or missing information
- safety or confirmation state

It should omit or summarize:

- irrelevant old turns
- oversized payloads
- internal stack traces
- implementation details that do not help the model act

Context serialization is application-specific, but the contract should be
registered in the agent definition so it can be inspected and reused across
harnesses.
