import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { loadOperatorConfig } from "./config";

// Operator credentials: who is deploying. Local-only, never committed.
// Default ~/.config/zap-arc/credentials.env (dotenv format); relocatable via
// the operator config. GCP auth is separate — gcloud ADC, no key file.
const DEFAULT_CREDENTIALS_PATH = join(
  homedir(),
  ".config/zap-arc/credentials.env",
);

function credentialsPath(): string {
  return loadOperatorConfig().credentials ?? DEFAULT_CREDENTIALS_PATH;
}

export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function loadCredentials(): Record<string, string> {
  const path = credentialsPath();
  if (!existsSync(path)) return {};
  return parseDotenv(readFileSync(path, "utf8"));
}

export { credentialsPath };
