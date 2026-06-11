// Arc's two template syntaxes:
//
// - Single-brace `{var}` context variables (slug, service, network, plus any
//   extra scalar keys the network config defines). Used in config values —
//   registry, backend, provider configs, module defaults — never in hook
//   commands, where it would collide with shell `${...}` syntax.
// - Double-brace `{{ns.key}}` namespaced references (`{{cred.NAME}}`,
//   `{{params.key}}`, `{{output.name}}`). Used in provider configs, module
//   manifest env injections, and hooks.

const VAR_PATTERN = /\{([a-z][a-z0-9-]*)\}/g;
const REF_PATTERN = /\{\{\s*([a-z]+)\.([A-Za-z0-9_.-]+)\s*\}\}/g;

export function expandVars(
  template: string,
  vars: Record<string, string>,
  what: string,
): string {
  return template.replace(VAR_PATTERN, (_match, key: string) => {
    const value = vars[key];

    if (value === undefined) {
      throw new Error(
        `Unknown template variable {${key}} in ${what}. Available: ${Object.keys(
          vars,
        )
          .sort()
          .join(", ")}`,
      );
    }

    return value;
  });
}

// Recursively expands {var} placeholders in every string of a config value.
export function expandVarsDeep<T>(
  value: T,
  vars: Record<string, string>,
  what: string,
): T {
  if (typeof value === "string") {
    return expandVars(value, vars, what) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandVarsDeep(item, vars, what)) as T;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandVarsDeep(v, vars, what)]),
    ) as T;
  }

  return value;
}

export type RefResolver = (namespace: string, key: string) => string;

export function renderRefs(
  template: string,
  resolve: RefResolver,
  what: string,
): string {
  return template.replace(
    REF_PATTERN,
    (_match, namespace: string, key: string) => {
      try {
        return resolve(namespace, key);
      } catch (error) {
        throw new Error(
          `${what}: ${error instanceof Error ? error.message : error}`,
        );
      }
    },
  );
}

export function renderRefsDeep<T>(
  value: T,
  resolve: RefResolver,
  what: string,
): T {
  if (typeof value === "string") {
    return renderRefs(value, resolve, what) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderRefsDeep(item, resolve, what)) as T;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        renderRefsDeep(v, resolve, what),
      ]),
    ) as T;
  }

  return value;
}

// Collects {{output.NAME}} references so the renderer can wire root outputs
// for hooks to read after apply.
export function collectOutputRefs(text: string): string[] {
  const refs: string[] = [];

  for (const match of text.matchAll(REF_PATTERN)) {
    if (match[1] === "output") refs.push(match[2]);
  }

  return refs;
}

// Credential values must never echo — applied to anything arc prints that
// could embed a templated secret (hook commands, hook env).
export function maskSecrets(text: string, secrets: Iterable<string>): string {
  let masked = text;

  for (const secret of secrets) {
    if (secret.length === 0) continue;
    masked = masked.replaceAll(secret, "***");
  }

  return masked;
}

export function kebabToSnake(key: string): string {
  return key.replaceAll("-", "_");
}

// Top-level keys only: nested values (env maps, labels) are Terraform data
// whose keys must pass through untouched.
export function kebabKeysToSnake(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [kebabToSnake(k), v]),
  );
}
