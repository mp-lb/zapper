# Agent Tools

Tools are registered functions. Treat them like routes: named, typed, validated,
inspectable boundaries between the agent and application behavior.

Use `@mp-lb/tools-agent-framework` tool definitions for new agent tools.

## Tool Shape

A tool definition should include:

- name
- description
- input schema
- execution handler
- metadata useful for admin/debug inspection

Tool names should be stable typed strings. Prefer clear domain/action names such
as `property_list`, `contact_create`, or `task_update`.

## Boundaries

Tools own application behavior. Prompts should explain when to call tools, but
tools must still validate inputs, enforce auth, and protect destructive actions.

Risky, ambiguous, destructive, financial, legal, or compliance-sensitive actions
should require clear confirmation before execution.

## Reuse

Tools should be reusable across harnesses where possible. A chat loop, realtime
voice session, workflow runner, and eval runner should be able to reference the
same tool definition or a thin adapter around it.

Provider-specific tool shapes should be adapters, not the source of truth.
