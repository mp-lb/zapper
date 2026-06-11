import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseDotenv } from "./creds";

// The env pool: all production values available to this project, resolved at
// deploy time. Names are whitelisted per service in the deploy block; values
// come from the resolver (pluggable — ours decrypts secrets.json.enc) merged
// over the public file (.env.production). ArcNet never stores values.
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

export function whitelistEnv(
  pool: Record<string, string>,
  names: string[],
  serviceName: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    if (name in pool) result[name] = pool[name];
    else missing.push(name);
  }

  if (missing.length > 0) {
    throw new Error(
      `Service '${serviceName}' whitelists env vars not present in the resolved pool: ${missing.join(", ")}`,
    );
  }

  return result;
}
