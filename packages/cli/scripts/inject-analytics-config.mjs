/* global process */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const repoRoot = resolve(cliRoot, "..", "..");
const arcnetPath = join(repoRoot, ".arcnet", "arcnet.yaml");
const configPath = join(cliRoot, "dist", "analytics", "buildConfig.js");

function readProductionEnv() {
  if (!existsSync(arcnetPath)) return {};
  const variables = parse(readFileSync(arcnetPath, "utf8"))?.variables;
  return variables && typeof variables === "object" ? variables : {};
}

const env = {
  ...readProductionEnv(),
  ...process.env,
};

const postHogKey = env.POSTHOG_KEY || env.NEXT_PUBLIC_POSTHOG_KEY || "";
const postHogHost = env.POSTHOG_HOST || env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

if (!existsSync(configPath)) {
  throw new Error(`Missing analytics build config at ${configPath}`);
}

const source = readFileSync(configPath, "utf8")
  .replace("__ZAPPER_POSTHOG_KEY__", postHogKey)
  .replace("__ZAPPER_POSTHOG_HOST__", postHogHost);

writeFileSync(configPath, source);
