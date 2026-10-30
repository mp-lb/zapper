import { resolve } from "node:path";
import { addJsExtensions } from "./build/addJsExtensions";

const directory = process.argv[2];
if (!directory || process.argv.length !== 3)
  throw new Error("Usage: zap t add-js-extensions -- <dist-directory>");
await addJsExtensions(resolve(directory));
