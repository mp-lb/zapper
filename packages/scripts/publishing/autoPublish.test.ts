import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

for (const scenario of [
  "unchanged",
  "dry-run",
  "publish",
  "explicit-output",
  "build-failure",
]) {
  test(`publisher ${scenario} keeps manifests intact and reports the correct action`, () => {
    const root = mkdtempSync(join(tmpdir(), "forum-publish-test-"));

    try {
      const scripts = join(root, "packages/scripts");
      const packageDir = join(root, "packages/example");
      const bin = join(root, "bin");
      for (const dir of [scripts, packageDir, bin])
        mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        '{"private":true,"type":"module"}',
      );

      writeFileSync(
        join(scripts, "package.json"),
        '{"private":true,"type":"module"}',
      );

      const manifest = JSON.stringify({
        name: "@fixture/example",
        version: "0.0.7",
        private: false,
        scripts: { build: "fixture-build" },
      });

      writeFileSync(join(packageDir, "package.json"), manifest);
      writeFileSync(
        join(packageDir, "index.js"),
        'export const value = "original";',
      );

      const remote = join(root, "remote");
      cpSync(packageDir, join(remote, "package"), { recursive: true });
      execFileSync("tar", [
        "-czf",
        join(root, "remote.tgz"),
        "-C",
        remote,
        "package",
      ]);

      if (scenario !== "unchanged")
        writeFileSync(
          join(packageDir, "index.js"),
          'export const value = "changed";',
        );
      copyFileSync(
        new URL("../autoPublish.ts", import.meta.url),
        join(scripts, "autoPublish.ts"),
      );

      const mock = fileURLToPath(
        new URL("./mockPackageManager.ts", import.meta.url),
      );

      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      for (const manager of ["npm", "pnpm"])
        writeFileSync(
          join(bin, manager),
          `#!/bin/sh\nexec ${quote(process.execPath)} --experimental-strip-types ${quote(mock)} ${manager} "$@"\n`,
          { mode: 0o755 },
        );
      const output = join(root, "github-output");

      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          join(scripts, "autoPublish.ts"),
          ...(scenario === "dry-run" ? ["--dry-run"] : []),
          ...(scenario === "explicit-output"
            ? [`--github-output=${output}`]
            : []),
        ],
        {
          cwd: tmpdir(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            PUBLISH_FIXTURE: root,
            PUBLISH_FIXTURE_FAIL_BUILD:
              scenario === "build-failure" ? "1" : "0",
            GITHUB_OUTPUT: scenario === "explicit-output" ? undefined : output,
          },
        },
      );

      assert.equal(
        readFileSync(join(packageDir, "package.json"), "utf8"),
        manifest,
      );

      const calls = readFileSync(join(root, "calls"), "utf8");
      assert.equal(
        calls.includes("pnpm publish"),
        scenario === "publish" || scenario === "explicit-output",
      );

      assert.equal(
        existsSync(join(root, ".fssstack-release-result.json")),
        false,
      );

      if (scenario === "build-failure") {
        assert.notEqual(result.status, 0);
        assert.equal(existsSync(output), false);
      } else {
        assert.equal(result.status, 0, result.stderr);

        const action =
          scenario === "unchanged"
            ? "unchanged"
            : scenario === "dry-run"
              ? "would-publish"
              : "published";

        const version = scenario === "unchanged" ? "1.0.0" : "1.0.1";
        assert.deepEqual(
          JSON.parse(
            readFileSync(output, "utf8")
              .trim()
              .replace(/^release_report=/, ""),
          ),
          [{ name: "@fixture/example", version, action }],
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
