import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

for (const fail of [false, true]) {
  test(`publication verifier ${fail ? "rejects registry failures" : "verifies the version and tarball"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "forum-registry-test-"));

    try {
      const calls = join(root, "calls");

      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          "--import",
          new URL("./mockRegistry.ts", import.meta.url).href,
          fileURLToPath(new URL("../verifyPublication.ts", import.meta.url)),
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            REGISTRY_FIXTURE: calls,
            REGISTRY_FIXTURE_FAIL: fail ? "1" : "0",
            FSSSTACK_RELEASE_RESULT: JSON.stringify([
              {
                name: "@fixture/example",
                version: "1.0.1",
                action: "published",
              },
            ]),
          },
        },
      );

      if (fail) {
        assert.notEqual(result.status, 0);
        assert.ok(result.stderr.includes("HTTP 500"));
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(result.stdout.includes("Verified public package"));
        assert.ok(
          readFileSync(calls, "utf8").includes(
            "HEAD https://fixture.invalid/package.tgz",
          ),
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
