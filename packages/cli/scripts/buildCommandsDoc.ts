/**
 * Zapper-specific assembly of docs/commands.md: wraps the generated commander
 * reference in a hand-authored header/footer. The generator itself
 * (generateCliReference) lives in the shared @mp-lb/cli-docs package; the zapper
 * details (which command tree, which shortcuts, the narrative prose) live here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { generateCliReference } from "@mp-lb/cli-docs";
import { CommanderCli } from "../src/cli/CommanderCli";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the generated reference document. */
export const COMMANDS_DOC_PATH = join(
  SCRIPTS_DIR,
  "..",
  "..",
  "..",
  "docs",
  "commands.md",
);

/**
 * Top-level convenience shortcuts that delegate to a canonical subcommand.
 * These are kept as real top-level commands for muscle memory, but folded into
 * a "Shortcuts" table in the reference instead of getting full sections.
 */
const ALIAS_OF: Record<string, string> = {
  gst: "git status",
  ggpur: "git pull",
  gsta: "git stash",
  gco: "git checkout",
  ginfo: "global info",
  glist: "global list",
  gkill: "global kill",
  gprune: "global prune",
};

function readTemplate(file: string): string {
  return readFileSync(join(SCRIPTS_DIR, file), "utf8").trim();
}

export function buildCommandsDoc(): string {
  const program = (new CommanderCli() as unknown as { program: Command })
    .program;
  const header = readTemplate("cli-reference.header.md");
  const footer = readTemplate("cli-reference.footer.md");
  const reference = generateCliReference(program, { aliasOf: ALIAS_OF }).trim();
  return [header, "", reference, "", footer, ""].join("\n");
}
