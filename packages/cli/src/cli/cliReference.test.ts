import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { CommanderCli } from "./CommanderCli";
import {
  buildCommandsDoc,
  COMMANDS_DOC_PATH,
} from "../../scripts/buildCommandsDoc";

function getProgram(): Command {
  return (new CommanderCli() as unknown as { program: Command }).program;
}

function findCommand(parent: Command, name: string): Command | undefined {
  return parent.commands.find(
    (cmd) => cmd.name() === name || cmd.aliases().includes(name),
  );
}

function walk(
  cmd: Command,
  path: string[],
  visit: (c: Command, p: string[]) => void,
) {
  for (const sub of cmd.commands) {
    const subPath = [...path, sub.name()];
    visit(sub, subPath);
    walk(sub, subPath, visit);
  }
}

describe("CLI reference / command tree", () => {
  it("gives every command and subcommand a non-empty description", () => {
    const program = getProgram();
    const missing: string[] = [];
    walk(program, ["zap"], (cmd, path) => {
      if (!cmd.description()) missing.push(path.join(" "));
    });

    expect(missing).toEqual([]);
  });

  it("registers the formerly positional groups as real subcommands", () => {
    const program = getProgram();

    const expectations: Record<string, string[]> = {
      volume: ["list", "prune", "reset"],
      profile: ["list", "current", "use", "reset"],
      stack: ["id", "current", "list"],
      instance: ["label"],
      global: ["list", "info", "prune", "kill"],
      system: ["projects", "registry", "resources"],
    };

    for (const [group, subs] of Object.entries(expectations)) {
      const groupCmd = findCommand(program, group);
      expect(groupCmd, `group ${group} should exist`).toBeDefined();

      for (const sub of subs) {
        expect(
          findCommand(groupCmd!, sub),
          `${group} ${sub} should be a real subcommand`,
        ).toBeDefined();
      }
    }

    const system = findCommand(program, "system")!;
    const registry = findCommand(system, "registry")!;

    for (const sub of ["prune", "forget", "repair"]) {
      expect(
        findCommand(registry, sub),
        `system registry ${sub}`,
      ).toBeDefined();
    }

    const resources = findCommand(system, "resources")!;

    for (const sub of ["audit", "cleanup"]) {
      expect(
        findCommand(resources, sub),
        `system resources ${sub}`,
      ).toBeDefined();
    }
  });

  it("keeps docs/commands.md in sync with the commander tree", () => {
    const committed = readFileSync(COMMANDS_DOC_PATH, "utf8");
    expect(buildCommandsDoc()).toBe(committed);
  });
});
