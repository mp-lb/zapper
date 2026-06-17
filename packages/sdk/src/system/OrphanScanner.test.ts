import { describe, expect, it } from "vitest";
import { parseWrapperProcesses } from "./OrphanScanner";

describe("parseWrapperProcesses", () => {
  it("extracts pid and script path from bash wrapper invocations", () => {
    const output = [
      "  123 /bin/bash /Users/me/Code/__instances__/proj-abc/.zap/proj.backend.1780924696153.sh",
      " 4567 bash /Users/me/Code/proj/.zap/proj.web.1780924696152.sh",
      "  999 node /Users/me/Code/proj/server.js",
      " 1000 /bin/bash /Users/me/somescript.sh",
      "  777 /bin/zsh /Users/me/Code/proj/.zap/proj.api.1.sh",
    ].join("\n");

    expect(parseWrapperProcesses(output)).toEqual([
      {
        pid: 123,
        scriptPath:
          "/Users/me/Code/__instances__/proj-abc/.zap/proj.backend.1780924696153.sh",
      },
      {
        pid: 4567,
        scriptPath: "/Users/me/Code/proj/.zap/proj.web.1780924696152.sh",
      },
    ]);
  });

  it("returns an empty list for empty output", () => {
    expect(parseWrapperProcesses("")).toEqual([]);
  });
});
