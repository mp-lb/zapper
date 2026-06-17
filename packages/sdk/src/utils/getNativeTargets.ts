import { ZapperConfig } from "../config/schemas";
import * as path from "path";

export interface NativeTarget {
  name: string;
  cwd: string;
}

export function getNativeTargets(
  config: ZapperConfig | null,
  configDir: string | null,
): NativeTarget[] {
  if (!config || !configDir) return [];

  const entries = config.native ? Object.entries(config.native) : [];

  return entries
    .filter(([, p]) => !!p.repo)
    .map(([name, process]) => {
      const cwd =
        process.cwd && process.cwd.trim().length > 0 ? process.cwd : name;

      const resolved = path.isAbsolute(cwd) ? cwd : path.join(configDir, cwd);
      return { name, cwd: resolved };
    });
}
