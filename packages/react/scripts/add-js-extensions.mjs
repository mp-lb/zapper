import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));

const relativeSpecifierPattern =
  /(from\s+["']|import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["'])/g;

const hasExtension = (specifier) => extname(specifier.split("?")[0]) !== "";

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const isDirectory = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

// Resolve a relative ESM specifier to the suffix that makes it runnable:
// "./foo" -> "./foo.js" when foo.js is a file, or "./foo/index.js" when foo
// is a directory with a barrel index. Returns the original when already valid.
const resolveSpecifier = async (fromFile, specifier) => {
  if (hasExtension(specifier)) {
    return specifier;
  }

  const targetBase = resolve(dirname(fromFile), specifier);

  if (await isFile(`${targetBase}.js`)) {
    return `${specifier}.js`;
  }

  if (await isDirectory(targetBase)) {
    return `${specifier}/index.js`;
  }

  return specifier;
};

const patchFile = async (path) => {
  const source = await readFile(path, "utf8");

  const matches = [...source.matchAll(relativeSpecifierPattern)];

  if (matches.length === 0) {
    return;
  }

  let patched = source;

  for (const [, prefix, specifier, suffix] of matches) {
    const resolved = await resolveSpecifier(path, specifier);

    if (resolved !== specifier) {
      patched = patched.replace(
        `${prefix}${specifier}${suffix}`,
        `${prefix}${resolved}${suffix}`,
      );
    }
  }

  if (patched !== source) {
    await writeFile(path, patched);
  }
};

const patchDirectory = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await patchDirectory(path);
        return;
      }

      if (
        entry.isFile() &&
        (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))
      ) {
        await patchFile(path);
      }
    }),
  );
};

await patchDirectory(distDirectory);
