import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const required = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const root = resolve(import.meta.dirname, "../../..");
const config = parse(readFileSync(resolve(root, ".arcnet/arcnet.yaml"), "utf8"));
const secrets = JSON.parse(readFileSync(0, "utf8"));
const values = {
  APPLE_ID: config.variables?.APPLE_ID,
  APPLE_TEAM_ID: config.variables?.APPLE_TEAM_ID,
  ...secrets,
};

for (const name of required) {
  const value = values[name];
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`Missing or invalid macOS release input: ${name}`);
  }
  const delimiter = `ARCNET_${randomUUID().replaceAll("-", "")}`;
  console.log(`::add-mask::${value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`);
  appendFileSync(process.env.GITHUB_ENV, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}
