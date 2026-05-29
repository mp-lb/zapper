# Plug-In Module Pattern

Use the plug-in module pattern when a feature is really a host plus a set of
self-contained vertical modules. The registry is the composition point, but the
underlying pattern is a module that plugs into a host through an explicit
contract. Each plug-in module owns its schema, server behavior, UI, and
operational notes.

Use "plug-in module" for first-party code in this repo. "Plugin" alone can
imply third-party installability or runtime loading, while "extension" can imply
a horizontal add-on to something central. Most Doctrine cases are first-party,
statically imported vertical modules with a typed registry.

## When To Use It

Use this pattern when the host feature has multiple variants that should not
share one universal form, report, worker, or branching component.

Good fits:

- admin jobs, where each job has different params, execution behavior, and
  report UI
- Gen AI providers, where each provider has different models, params, request
  payloads, result parsing, and availability checks
- file types, where each type has different icons, editors, previews, and
  creation behavior

Do not use it for simple enum labels or tiny formatting differences. A registry
is useful when it keeps variant-specific decisions out of the host.

## Shape

The host owns lifecycle and placement. Plug-in modules own meaning.

```text
packages/some-feature/
  registry.ts
  someModule/
    schemas.ts
    worker.ts
    paramsWidget.tsx
    reportWidget.tsx
    notes.md
```

The exact files can vary by feature, but the boundary should stay the same:

- `registry.ts` exports the ordered list used by dropdowns, menus, routers, or
  dispatchers.
- `schemas.ts` owns Zod schemas and derived types for the module's inputs,
  outputs, progress events, and persisted data.
- `worker.ts` or equivalent owns server-side execution for that module.
- UI widgets own module-specific forms and reports.
- `notes.md` captures operational context, deletion criteria, rollout notes, or
  provider quirks.

For browser-safe metadata, keep the registry free of server-only imports. If a
registry also needs server handlers or React components, split it into explicit
surfaces:

```text
registry.ts        # IDs, labels, schemas, capability metadata
serverRegistry.ts  # worker handlers
uiRegistry.tsx     # widgets and icons
```

## Registry Rules

Registries should be boring and strongly typed.

- Preserve product order in the registry array.
- Use stable IDs; IDs are part of persisted runs, URLs, analytics, and logs.
- Export the entry type and the registry value.
- Keep each entry declarative. Avoid putting branching logic in the registry.
- The host should dispatch by ID and delegate to the selected module.
- Do not make every module conform to a fake shared report shape.

The registry can contain common metadata:

```ts
export type PlugInModuleEntry = {
  id: string;
  name: string;
  description: string;
  status: "active" | "legacy" | "deprecated";
};

export const moduleRegistry = [
  {
    id: "example-v1",
    name: "Example v1",
    description: "Does one specific thing.",
    status: "active",
  },
] as const satisfies readonly PlugInModuleEntry[];
```

## Host Rules

The host should stay small:

- list registered modules
- validate the selected module's input
- start execution
- persist lifecycle status and timestamps
- route rendering to the selected module's UI
- expose shared services such as logging, storage, auth, and database access

The host should not own provider-specific payloads, job-specific report tables,
or one giant switch that knows every detail of every module. A temporary
switch is acceptable while migrating legacy code, but it should call into
plug-in modules rather than collecting more behavior.

## Admin Jobs

Admin jobs should use this pattern because every job can have different params
and a different report. A collection rename job may only need a short summary.
A repair job may need a diff table. An enqueue job may need counts and links to
queued work. Treating all of those as `processed / total` rows makes the UI
misleading.

Target shape:

```text
packages/adminJobs/
  registry.ts
  migrateCamelCaseCollectionNames/
    schemas.ts
    worker.ts
    paramsWidget.tsx
    reportWidget.tsx
    notes.md
```

The admin dropdown should be populated from `packages/adminJobs/registry.ts`.
The runner should provide lifecycle plumbing, then delegate params, execution,
and report rendering to the selected job.

Most admin jobs are temporary. Mark legacy or cleanup jobs clearly in the
registry and delete them when the stale data they repair no longer matters.

## Gen AI

Gen AI providers should use the same shape. Each provider owns its own input
schema, default params, UI controls, API request mapping, response parsing, and
configuration checks.

Target shape:

```text
packages/genAi/
  imageGenerationRegistry.ts
  openAiImageGeneration/
    schemas.ts
    worker.ts
    paramsWidget.tsx
    notes.md
  geminiImageGeneration/
    schemas.ts
    worker.ts
    paramsWidget.tsx
    notes.md
```

The current image generation code already has provider-specific concepts:
OpenAI and Gemini use different schemas, model lists, UI controls, request
payloads, and response parsing. Those concepts should move behind provider
modules instead of accumulating in broad frontend, backend, or worker files.

## Migration Guidance

When moving existing code into this pattern:

1. Create the registry first with IDs, labels, descriptions, and status.
2. Move schemas next so frontend, backend, and tests agree on one contract.
3. Move one module's server behavior behind a worker entrypoint.
4. Move its UI into params/report widgets.
5. Delete host-level branching once every module has its own files.

Do not pause a cleanup halfway by adding a registry while continuing to put new
variant logic in the old host file. The registry should become the place where
the host discovers plug-in modules, not just a duplicate list.
