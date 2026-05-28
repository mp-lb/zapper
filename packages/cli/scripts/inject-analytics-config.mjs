/* global process */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const repoRoot = resolve(cliRoot, "..", "..");
const envPath = join(repoRoot, ".env.production");
const configPath = join(cliRoot, "dist", "analytics", "buildConfig.js");

function readProductionEnv() {
  if (!existsSync(envPath)) return {};
  return parse(readFileSync(envPath, "utf8"));
}

const env = {
  ...readProductionEnv(),
  ...process.env,
};

const postHogKey = env.POSTHOG_KEY || "";
const postHogHost = env.POSTHOG_HOST || "https://us.i.posthog.com";

if (!existsSync(configPath)) {
  throw new Error(`Missing analytics build config at ${configPath}`);
}

const source = readFileSync(configPath, "utf8")
  .replace("__ZAPPER_POSTHOG_KEY__", postHogKey)
  .replace("__ZAPPER_POSTHOG_HOST__", postHogHost);

writeFileSync(configPath, source);
