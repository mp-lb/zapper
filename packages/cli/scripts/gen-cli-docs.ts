/**
 * Generates docs/tech/commands.md from the commander command tree.
 *
 *   tsx scripts/gen-cli-docs.ts          # write docs/tech/commands.md
 *   tsx scripts/gen-cli-docs.ts --check  # fail if docs/tech/commands.md is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { buildCommandsDoc, COMMANDS_DOC_PATH } from "./buildCommandsDoc";

const content = buildCommandsDoc();
const checkMode = process.argv.includes("--check");
const displayPath = relative(process.cwd(), COMMANDS_DOC_PATH);

if (checkMode) {
  let current = "";
  try {
    current = readFileSync(COMMANDS_DOC_PATH, "utf8");
  } catch {
    current = "";
  }

  if (current !== content) {
    console.error(
      `${displayPath} is out of date with the commander tree.\n` +
        "Run `pnpm --filter @mp-lb/zapper docs:gen` and commit the result.",
    );
    process.exit(1);
  }

  console.log(`${displayPath} is up to date.`);
} else {
  writeFileSync(COMMANDS_DOC_PATH, content);
  console.log(`Wrote ${displayPath}`);
}
