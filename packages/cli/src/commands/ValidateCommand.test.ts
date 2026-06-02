import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { ValidateCommand } from "./ValidateCommand";
import type { CommandResult } from "./CommandResult";
import type { Zapper } from "../core/Zapper";

function asValidate(
  result: CommandResult,
): Extract<CommandResult, { kind: "validate" }> {
  if (result.kind !== "validate") {
    throw new Error(`expected validate result, got ${result.kind}`);
  }

  return result;
}

describe("ValidateCommand", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), "zapper-validate-command-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns valid for a valid config", async () => {
    const configPath = path.join(testDir, "zap.yaml");
    writeFileSync(
      configPath,
      `project: myproj
native:
  api:
    cmd: npm run dev
`,
    );

    const result = asValidate(
      await new ValidateCommand().execute({
        zapper: {} as Zapper,
        options: { config: configPath },
      }),
    );

    expect(result).toEqual({
      kind: "validate",
      valid: true,
      configPath,
    });
  });

  it("returns validation issues and raw Zod issues for invalid config", async () => {
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

    const result = asValidate(
      await new ValidateCommand().execute({
        zapper: {} as Zapper,
        options: { config: configPath },
      }),
    );

    expect(result.kind).toBe("validate");
    expect(result.valid).toBe(false);
    expect(result.configPath).toBe(configPath);
    expect(result.error?.name).toBe("ConfigValidationError");
    expect(result.error?.issues?.[0]).toContain("Unrecognized key");
    expect(result.error?.zodIssues?.[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["unexpected_key"],
    });
  });

  it("returns invalid when the config cannot be found", async () => {
    const missingPath = path.join(testDir, "missing.yaml");

    const result = await new ValidateCommand().execute({
      zapper: {} as Zapper,
      options: { config: missingPath },
    });

    expect(result).toEqual({
      kind: "validate",
      valid: false,
      configPath: missingPath,
      error: {
        name: "ConfigFileNotFoundError",
        message: `Config file not found: ${missingPath}`,
      },
    });
  });
});
