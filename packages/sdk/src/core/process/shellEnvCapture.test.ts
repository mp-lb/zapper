import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  captureShellEnv,
  clearShellEnvCaptureCache,
  parseMarkedEnvOutput,
} from "./shellEnvCapture";

describe("parseMarkedEnvOutput", () => {
  const marker = "ZAP_ENV_abc123";

  it("parses null-delimited entries between markers", () => {
    const output = `${marker}PATH=/usr/bin:/bin\0HOME=/home/me\0${marker}`;

    expect(parseMarkedEnvOutput(output, marker)).toEqual({
      PATH: "/usr/bin:/bin",
      HOME: "/home/me",
    });
  });

  it("discards rc-file noise outside the markers", () => {
    const output = `Welcome to my shell!\n${marker}PATH=/bin\0${marker}\ntrailing noise`;

    expect(parseMarkedEnvOutput(output, marker)).toEqual({ PATH: "/bin" });
  });

  it("preserves multiline values and later equals signs", () => {
    const output = `${marker}MULTI=line one\nline two\0URL=https://x?a=1\0${marker}`;

    expect(parseMarkedEnvOutput(output, marker)).toEqual({
      MULTI: "line one\nline two",
      URL: "https://x?a=1",
    });
  });

  it("returns null when markers are missing", () => {
    expect(parseMarkedEnvOutput("PATH=/bin", marker)).toBeNull();
  });

  it("returns null when nothing parseable sits between markers", () => {
    expect(parseMarkedEnvOutput(`${marker}${marker}`, marker)).toBeNull();
    expect(parseMarkedEnvOutput(`${marker}\0\0${marker}`, marker)).toBeNull();
  });

  it("ignores entries without a key", () => {
    const output = `${marker}=weird\0OK=1\0${marker}`;

    expect(parseMarkedEnvOutput(output, marker)).toEqual({ OK: "1" });
  });
});

describe("captureShellEnv", () => {
  let testDir: string;

  beforeEach(() => {
    clearShellEnvCaptureCache();
    testDir = mkdtempSync(path.join(tmpdir(), "zap-shell-capture-"));
  });

  afterEach(() => {
    clearShellEnvCaptureCache();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("captures the environment from a real shell", async () => {
    const result = await captureShellEnv("/bin/bash");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.env.PATH).toBeTruthy();
      expect(result.env.HOME).toBeTruthy();
    }
  });

  it("fails cleanly when the shell binary does not exist", async () => {
    const result = await captureShellEnv("/nonexistent/shell");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatch(/ENOENT/);
    }
  });

  it("fails cleanly when the shell exits non-zero", async () => {
    const fakeShell = path.join(testDir, "failing-shell");
    writeFileSync(fakeShell, "#!/bin/sh\nexit 3\n", { mode: 0o755 });

    const result = await captureShellEnv(fakeShell);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatch(/code 3/);
    }
  });

  it("times out when the shell hangs", async () => {
    const fakeShell = path.join(testDir, "hanging-shell");
    writeFileSync(fakeShell, "#!/bin/sh\nsleep 30\n", { mode: 0o755 });

    const result = await captureShellEnv(fakeShell, 250);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatch(/timed out/);
    }
  });

  it("memoizes captures per shell binary", async () => {
    const first = captureShellEnv("/bin/bash");
    const second = captureShellEnv("/bin/bash");

    expect(second).toBe(first);
    await first;
  });
});
