import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addJsExtensions } from "./build/addJsExtensions";

test("rewrites emitted imports and declarations, preserves existing extensions, and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "zapper-extensions-"));

  try {
    await mkdir(join(root, "nested"));
    await mkdir(join(root, "barrel"));
    await writeFile(join(root, "plain.js"), "export const value = 1;\n");
    await writeFile(join(root, "barrel/index.js"), "export const value = 2;\n");

    const source =
      'export { value } from "../plain";\nexport * from "../barrel";\nconst load = () => import("../plain");\nexport * from "../plain.js?raw";\nexport * from "external";\nexport * from "../missing";\n';

    await writeFile(join(root, "nested/index.js"), source);
    await writeFile(join(root, "nested/index.d.ts"), source);
    await writeFile(join(root, "source.ts"), source);

    const expected = source
      .replaceAll('"../plain"', '"../plain.js"')
      .replaceAll('"../barrel"', '"../barrel/index.js"');

    await addJsExtensions(root);
    await addJsExtensions(root);
    assert.equal(
      await readFile(join(root, "nested/index.js"), "utf8"),
      expected,
    );

    assert.equal(
      await readFile(join(root, "nested/index.d.ts"), "utf8"),
      expected,
    );

    assert.equal(await readFile(join(root, "source.ts"), "utf8"), source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
