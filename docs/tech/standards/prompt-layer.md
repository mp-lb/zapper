# Prompt Storage

Store reusable LLM prompts as Markdown files in a top-level `prompts/` directory. Each prompt is addressed by a stable id that maps directly to a file name:

- `chat-agent-system` -> `prompts/chat-agent-system.md`
- `document-generation-instructions` -> `prompts/document-generation-instructions.md`
- `document-generation-input` -> `prompts/document-generation-input.md`

Runtime code should not read these files directly. Instead, prompt access goes through a prompt service abstraction:

```ts
type PromptService = {
  load: (id: string) => Promise<string>;
  render: (id: string, variables?: PromptVariables) => Promise<string>;
};
```

The concrete implementation typically lives in a server package and is exported for use by application code.

## Loading

The `loadPrompt(id)` function validates the prompt id, finds the top-level `prompts/` directory by walking upward from the current working directory, reads the corresponding `<id>.md` file, trims it, and returns the prompt text.

Prompt ids must match this format:

```text
^[a-z0-9][a-z0-9-]*$
```

This keeps prompt lookup simple and prevents callers from passing paths like `../secret`.

## Caching

Prompt files are cached in memory by id using a module-level `Map<string, string>`.

This means each Node.js process reads a prompt from disk only once, then reuses the cached text for later LLM calls. This avoids repeated filesystem reads on hot paths like chat replies, document generation, and template generation.

The cache is process-local. Restarting the backend or worker clears it, which is fine for development because servers hot reload or restart when code changes.

## Rendering

Some prompt files contain placeholders such as:

```md
{{templatePrompt}}
{{markdownStyleGuide}}
{{sourceText}}
```

Callers use `renderPrompt(id, variables)` to load the prompt and replace placeholders. Rendering is intentionally small and explicit:

- placeholders use `{{ variableName }}`
- variable names must start with a letter and then contain letters, numbers, or underscores
- missing variables throw an error
- `null` and `undefined` render as an empty string
- other values are converted with `String(value)`

## Templating Library

For rendering prompts with placeholders, use the [Mustache](https://mustache.github.io/) templating library. Mustache is a minimal, logic-less template engine that uses `{{variable}}` syntax, matching the prompt rendering style.

Mustache supports strict variable replacement and can be configured to throw errors on missing variables, ensuring all placeholders are provided. It converts `null` and `undefined` to empty strings by default, and other values are stringified.

This choice aligns with the explicit and simple rendering approach described, keeping prompt templates clean and reusable.

## Abstraction Boundary

Most packages should depend on `PromptService`, not on the filesystem or any specific server package.

The backend wires the concrete implementation into request context:

```ts
prompts: {
  load: loadPrompt,
  render: renderPrompt,
}
```

Feature code then retrieves or receives that service and calls:

```ts
await prompts.load("chat-agent-system");

await prompts.render("document-generation-input", {
  markdownStyleGuide,
  templatePrompt,
  sourceText,
});
```

This keeps application code independent from where prompts are stored. Today they live in top-level Markdown files; later they could move to a database, bundled assets, remote config, or a build artifact without changing most of the app.

## Usage Rule

Use prompt files for reusable, shared, system-level, or long-form LLM instructions.

Do not inline substantial prompts inside feature code unless the text is truly local and tiny. Feature code should compose prompts by loading named prompt files and passing explicit variables into `render`.
