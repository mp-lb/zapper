# Agent Prompts

Prompts are source code. They live in the application repository, are reviewed
with code, and are loaded from disk by `@mp-lb/tools-agent-framework`.

## Prompt Location

Use a top-level `prompts/` directory by default.

Prompt slugs resolve to markdown files:

- `prompt("core")` resolves to `prompts/core.md`
- `prompt("handoff-policy")` resolves to `prompts/handoff-policy.md`

Applications may configure another prompt root only when the repo layout
requires it.

## Prompt Parts

Agent definitions should compose prompts from explicit parts:

- static prompt parts for always-included context
- parameterized prompt parts for runtime values
- conditional prompt parts for channel, product mode, feature flags, or other
  runtime conditions

Conditional prompt parts must include an inspectable condition label. Admin and
debug screens should be able to show the raw prompt part, whether it was
included, and why.

```ts
conditionalPrompt("voice-style", {
  when: "channel == voice",
  include: ({ channel }) => channel === "voice",
});
```

## Rendering

Prompt rendering should be deterministic for a given runtime context. Rendered
prompts may be sent to a model or shown in debug/admin screens.

When a prompt is templated or conditional, debug output should distinguish:

- the raw prompt file
- the rendered prompt text
- included prompt parts
- excluded prompt parts
- the condition label for each conditional part

Do not hide important system context in ad hoc strings outside the agent
definition. If the model needs it, make it a named prompt part or a named
context serializer.
