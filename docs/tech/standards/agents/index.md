# Agentic Applications

Agentic applications should treat an agent as a reusable product definition, not
as a particular model loop.

An agent is:

- prompts: repo-local markdown context
- tools: registered functions the model may call
- context: deliberate serialization of logs and runtime state
- harness: the loop that runs the agent, such as chat, voice, workflow, or evals

Use `@mp-lb/tools-agent-framework` for new agent definitions. The framework is
the source-code convention layer: it defines prompt parts, tool registration,
context contracts, prompt rendering, and inspectable agent metadata.

The framework should not own hosting, memory storage, model provider selection,
or the application loop. Those stay in the consuming application or in an
explicit harness adapter.

## Source Of Truth

The durable source of truth is the agent definition in the repository:

```ts
export const assistantAgent = defineAgent({
  id: "assistant",
  name: "Assistant",
  prompts: [
    prompt("core"),
    prompt("handoff-policy"),
    conditionalPrompt("voice-style", {
      when: "channel == voice",
      include: ({ channel }) => channel === "voice",
    }),
  ],
  tools: [recordsTool, searchTool],
  context: conversationContext,
});
```

The same definition should be usable for prompt rendering, runtime setup,
debug/admin inspection, and eval metadata.

## Standards

- [prompts.md](./prompts.md)
- [tools.md](./tools.md)
- [logs-and-context.md](./logs-and-context.md)
- [harnesses.md](./harnesses.md)
- [evals.md](./evals.md)
