import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseDotenv } from "./creds";

// The env pool: all production values available to this project, resolved at
// deploy time. A service's env: list draws from it — bare `KEY` whitelists a
// pool value, `KEY=value` is a committed literal (split on the first `=`,
// dotenv intuition). Values come from the resolver (pluggable — ours decrypts
// secrets.json.enc) merged over the public file (.env.production). Arc never
// stores values.
export function resolveEnvPool(
  projectDir: string,
  resolverCmd: string,
  publicFile: string,
): Record<string, string> {
  let publicVars: Record<string, string> = {};
  const publicPath = join(projectDir, publicFile);

  if (existsSync(publicPath)) {
    publicVars = parseDotenv(readFileSync(publicPath, "utf8"));
  }

  const out = execSync(resolverCmd, {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    maxBuffer: 10 * 1024 * 1024,
  });

  return { ...publicVars, ...parseEnvText(out) };
}

// Accepts either a JSON object or dotenv text.
export function parseEnvText(raw: string): Record<string, string> {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = parseDotenv(raw);
  }

  const result: Record<string, string> = {};

  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") result[k] = v;
    else if (v != null) result[k] = String(v);
  }

  return result;
}

// The names a service pulls from the pool (everything that isn't a literal).
export function bareEnvKeys(entries: string[]): string[] {
  return entries.filter((entry) => !entry.includes("="));
}

export function resolveServiceEnv(
  entries: string[],
  pool: Record<string, string>,
  serviceName: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const entry of entries) {
    const eq = entry.indexOf("=");

    if (eq === -1) {
      if (entry in pool) result[entry] = pool[entry];
      else missing.push(entry);
      continue;
    }

    result[entry.slice(0, eq)] = entry.slice(eq + 1);
  }

  if (missing.length > 0) {
    throw new Error(
      `Service '${serviceName}' whitelists env vars not present in the resolved pool: ${missing.join(", ")}`,
    );
  }

  return result;
}
