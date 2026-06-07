import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(docsDir, "public");
const sourceOrder = [
  "index.md",
  "commands.md",
  "configuration.md",
  "services.md",
  "healthchecks.md",
  "tasks.md",
  "project-metadata.md",
  "instances.md",
  "resource-management.md",
  "global-registry.md",
  "project-roots.md",
  "env-var-mgmt.md",
  "local-runtime.md",
  "output.md",
  "cli-development.md",
  "macos-development.md",
];

const entries = (
  await Promise.all(
    sourceOrder.map(async (file) => {
      try {
        const content = await readFile(join(docsDir, file), "utf8");
        return { file, content };
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    }),
  )
).filter(Boolean);

const full = [
  "# Zapper documentation",
  "",
  "This raw document is generated from the Markdown files that power the Zapper VitePress documentation site.",
  "",
  ...entries.flatMap(({ file, content }) => [
    `# Source: docs/${file}`,
    "",
    content.trim(),
    "",
  ]),
].join("\n");

const index = [
  "# Zapper documentation",
  "",
  "Raw documentation for agents and automation:",
  "",
  "- Full raw bundle: /llms-full.txt",
  ...entries.map(({ file }) => {
    const route = file === "index.md" ? "/" : `/${basename(file, ".md")}`;
    return `- ${file}: ${route}`;
  }),
  "",
].join("\n");

await mkdir(publicDir, { recursive: true });
await writeFile(join(publicDir, "llms.txt"), index);
await writeFile(join(publicDir, "llms-full.txt"), full);
