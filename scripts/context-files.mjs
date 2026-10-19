#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const usage = `usage:
  node scripts/context-files.mjs build [--agents|--claude]
`;

const [command, ...args] = process.argv.slice(2);
if (command !== "build") fail(usage.trim());

const outputs = parseOutputs(args);
const entry = findEntry();
const localContext = runMdcompile([entry, "--optional", "--silent"]);
const compiledContext = runFmCompile(["--stdin"], localContext);

for (const output of outputs) writeFileSync(output, compiledContext);

function parseOutputs(args) {
  const outputs = [];
  for (const arg of args) {
    if (arg === "--agents") outputs.push("AGENTS.md");
    else if (arg === "--claude") outputs.push("CLAUDE.md");
    else fail(`unknown option: ${arg}`);
  }
  if (new Set(outputs).size !== outputs.length) fail("duplicate output flag");
  return outputs.length > 0 ? outputs : ["AGENTS.md", "CLAUDE.md"];
}

function findEntry() {
  if (existsSync("context/index.md")) return "context/index.md";
  fail("no context source found: expected context/index.md");
}

function runMdcompile(args) {
  return execFileSync("npx", ["-y", "@mp-lb/mdcompile", ...args], {
    encoding: "utf8",
  });
}

function runFmCompile(args, input) {
  return execFileSync("fm", ["compile", ...args], { input, encoding: "utf8" });
}

function fail(message) {
  console.error(`${basename(process.argv[1])}: ${message}`);
  process.exit(1);
}
