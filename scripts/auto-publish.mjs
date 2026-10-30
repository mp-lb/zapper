#!/usr/bin/env node
/* global Buffer, console, process */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const dryRun = process.argv.includes("--dry-run");

function outputReport(report) {
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `release_report=${JSON.stringify(report)}\n`,
    );
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr?.trim() || result.error?.message || result.status}`,
    );
  }

  return result.stdout.trim();
}

function readPackage(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeVersion(entry, version) {
  const manifest = readPackage(entry.manifest);
  manifest.version = version;
  writeFileSync(entry.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

function latestVersion(name) {
  const result = spawnSync(
    "npm",
    ["view", name, "dist-tags.latest", "--json"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  if (result.status === 0) return JSON.parse(result.stdout.trim());
  if (/E404|404 Not Found/.test(result.stderr)) return null;
  throw new Error(
    `Could not read npm version for ${name}: ${result.stderr.trim()}`,
  );
}

function nextPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match)
    throw new Error(`Expected a stable semver version, got ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function entries() {
  const found = [];

  for (const folder of ["packages", "apps"]) {
    const base = join(root, folder);
    if (!existsSync(base)) continue;

    for (const name of readdirSync(base)) {
      const dir = join(base, name);
      const manifest = join(dir, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = readPackage(manifest);
      if (
        !pkg.private &&
        pkg.name &&
        pkg.publishConfig?.registry !== "https://npm.pkg.github.com"
      )
        found.push({ dir, manifest, pkg });
    }
  }

  const byName = new Map(found.map((entry) => [entry.pkg.name, entry]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(entry) {
    if (visited.has(entry.pkg.name)) return;
    if (visiting.has(entry.pkg.name))
      throw new Error(`Workspace dependency cycle at ${entry.pkg.name}`);
    visiting.add(entry.pkg.name);

    for (const name of Object.keys({
      ...entry.pkg.dependencies,
      ...entry.pkg.optionalDependencies,
      ...entry.pkg.peerDependencies,
    })) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency);
    }

    visiting.delete(entry.pkg.name);
    visited.add(entry.pkg.name);
    ordered.push(entry);
  }

  for (const entry of found) visit(entry);
  return ordered;
}

function packedFiles(tarball, scratch) {
  mkdirSync(scratch, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", scratch]);
  const files = new Map();

  function walk(dir, prefix = "") {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      const relative = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.isDirectory()) walk(path, relative);
      else if (item.isFile()) {
        let bytes = readFileSync(path);

        if (relative === "package.json") {
          const pkg = JSON.parse(bytes.toString("utf8"));
          delete pkg.version;
          bytes = Buffer.from(JSON.stringify(pkg));
        }

        files.set(relative, createHash("sha256").update(bytes).digest("hex"));
      }
    }
  }

  walk(join(scratch, "package"));
  return files;
}

function sameFiles(left, right) {
  return (
    left.size === right.size &&
    [...left].every(([path, hash]) => right.get(path) === hash)
  );
}

const packages = entries();

if (!packages.length) {
  console.log("No public npm packages found.");
  outputReport([]);
  process.exit(0);
}

const scratch = mkdtempSync(join(tmpdir(), "fssstack-publish-"));

const originalManifests = new Map(
  packages.map((entry) => [entry.manifest, readFileSync(entry.manifest)]),
);

const report = [];

function record(name, version, action) {
  report.push({ name, version, action });
}

try {
  const latest = new Map();

  for (const entry of packages) {
    const version = latestVersion(entry.pkg.name);
    latest.set(entry.pkg.name, version);
    if (version) writeVersion(entry, version);
  }

  for (const [index, entry] of packages.entries()) {
    const pkg = readPackage(entry.manifest);
    const current = latest.get(pkg.name);
    if (pkg.scripts?.build)
      run("pnpm", ["--filter", `${pkg.name}...`, "build"]);

    const localDir = join(scratch, `local-${index}`);
    mkdirSync(localDir);

    const localTarball = run(
      "pnpm",
      ["pack", "--pack-destination", localDir],
      entry.dir,
    )
      .split("\n")
      .at(-1);

    const localFiles = packedFiles(
      resolve(entry.dir, localTarball),
      join(scratch, `local-files-${index}`),
    );

    let changed = true;

    if (current) {
      const remoteDir = join(scratch, `remote-${index}`);
      mkdirSync(remoteDir);

      const remoteTarball = run("npm", [
        "pack",
        `${pkg.name}@${current}`,
        "--pack-destination",
        remoteDir,
        "--silent",
      ]);

      const remoteFiles = packedFiles(
        join(remoteDir, remoteTarball.split("\n").at(-1)),
        join(scratch, `remote-files-${index}`),
      );

      changed = !sameFiles(localFiles, remoteFiles);
    }

    if (!changed) {
      console.log(`${pkg.name}: unchanged at ${current}`);
      record(pkg.name, current, "unchanged");
      continue;
    }

    const version = current ? nextPatch(current) : pkg.version;
    console.log(
      `${pkg.name}: ${current || "unpublished"} → ${version}${dryRun ? " (dry run)" : ""}`,
    );

    if (dryRun) {
      record(pkg.name, version, "would-publish");
      continue;
    }

    writeVersion(entry, version);
    if (pkg.scripts?.build)
      run("pnpm", ["--filter", `${pkg.name}...`, "build"]);
    run(
      "pnpm",
      ["publish", "--no-git-checks", "--access", "public"],
      entry.dir,
    );

    record(pkg.name, version, "published");
  }
} finally {
  for (const [manifest, content] of originalManifests)
    writeFileSync(manifest, content);
  rmSync(scratch, { recursive: true, force: true });
}

outputReport(report);
