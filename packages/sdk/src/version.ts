import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
);

const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version: string;
};

export const VERSION = version;
