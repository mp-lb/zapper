#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

const usage = `usage:
  node scripts/context-files.mjs build [--agents|--claude] [--optional-extra] [extra-context ...]
  node scripts/context-files.mjs copy [--agents|--claude]
`;

const [command, ...rawArgs] = process.argv.slice(2);
if (command !== "build" && command !== "copy") {
  fail(usage.trim());
}

const options = parseArgs(rawArgs);
const outputs = options.outputs.length > 0 ? options.outputs : ["AGENTS.md", "CLAUDE.md"];

if (command === "build") {
  const entry = findEntry();
  runMdcompile([entry, "-o", "AGENTS.base.md", "--optional", "--silent"]);
  writeLocalFiles(outputs, options.extraContext);
} else {
  if (options.extraContext.length > 0) {
    fail("context-copy does not accept extra context paths; use context-build.");
  }
  ensureFile("AGENTS.base.md");
  for (const output of outputs) {
    copyFileSync("AGENTS.base.md", output);
  }
}

function parseArgs(args) {
  const outputs = [];
  const extraContext = [];
  let optionalExtra = false;

  for (const arg of args) {
    if (arg === "--agents") {
      outputs.push("AGENTS.md");
    } else if (arg === "--claude") {
      outputs.push("CLAUDE.md");
    } else if (arg === "--optional-extra") {
      optionalExtra = true;
    } else if (arg.startsWith("-")) {
      fail(`unknown option: ${arg}`);
    } else {
      extraContext.push(arg);
    }
  }

  if (new Set(outputs).size !== outputs.length) {
    fail("duplicate output flag");
  }

  for (const path of extraContext) {
    if (!existsSync(expandHome(path))) {
      if (optionalExtra) continue;
      fail(`extra context file not found: ${path}`);
    }
  }

  return {
    outputs,
    optionalExtra,
    extraContext: optionalExtra
      ? extraContext.filter((path) => existsSync(expandHome(path)))
      : extraContext,
  };
}

function writeLocalFiles(outputs, extraContext) {
  if (extraContext.length === 0) {
    for (const output of outputs) {
      copyFileSync("AGENTS.base.md", output);
    }
    return;
  }

  const dir = mkdtempSync(resolve(tmpdir(), "context-files-"));
  const entry = resolve(dir, "index.md");
  const imports = [
    `@${resolve("AGENTS.base.md")}`,
    ...extraContext.map((path) => `@${resolve(expandHome(path))}`),
  ];
  writeFileSync(entry, `${imports.join("\n\n")}\n`);

  try {
    for (const output of outputs) {
      runMdcompile([entry, "-o", output]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function findEntry() {
  for (const entry of ["docs/etc/agents-md/index.md", "agents-md/index.md"]) {
    if (existsSync(entry)) return entry;
  }
  fail("no context source found: expected docs/etc/agents-md/index.md or agents-md/index.md");
}

function ensureFile(path) {
  if (!existsSync(path)) {
    fail(`${path} does not exist; run context-build first.`);
  }
}

function runMdcompile(args) {
  execFileSync("npx", ["-y", "@mp-lb/mdcompile", ...args], {
    stdio: "inherit",
  });
}

function expandHome(path) {
  if (path === "~") return process.env.HOME ?? path;
  if (path.startsWith("~/")) return `${process.env.HOME}${path.slice(1)}`;
  return path;
}

function fail(message) {
  console.error(`${basename(process.argv[1])}: ${message}`);
  process.exit(1);
}
