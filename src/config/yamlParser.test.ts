import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { parseYamlFile } from "./yamlParser";
import { ConfigValidationError } from "../errors";

describe("yamlParser", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), "zapper-yaml-parser-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should accept bare_metal as a backward-compatible alias for native", () => {
    const configPath = path.join(testDir, "zap.yaml");

    writeFileSync(
      configPath,
      `project: myproj
bare_metal:
  api:
    cmd: npm run dev
`,
    );

    const parsed = parseYamlFile(configPath);

    expect(parsed.native?.api.cmd).toBe("npm run dev");
    expect(parsed.native?.api.name).toBe("api");
  });

  it("should reject unknown top-level fields", () => {
    const configPath = path.join(testDir, "zap.yaml");

    writeFileSync(
      configPath,
      `project: myproj
native:
  api:
    cmd: npm run dev
unexpected_key: true
`,
    );

    try {
      parseYamlFile(configPath);
      throw new Error("Expected parseYamlFile to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).toContain(
        'Unrecognized key: "unexpected_key"',
      );
    }
  });
});
