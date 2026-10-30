import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getVmStatus } from "./getVmStatus";
import { runCommand } from "./runCommand";
import { runE2E } from "./runE2E";
import { syncVmSource } from "./syncVmSource";

vi.mock("./getVmStatus", () => ({ getVmStatus: vi.fn() }));
vi.mock("./runCommand", () => ({ runCommand: vi.fn() }));
vi.mock("./syncVmSource", () => ({ syncVmSource: vi.fn() }));
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(process, "platform", { value: "darwin" });
  for (const name of Object.keys(process.env))
    if (name.startsWith("ZAP_E2E_")) vi.stubEnv(name, undefined);
  vi.mocked(getVmStatus).mockResolvedValue("Stopped");
  vi.mocked(runCommand).mockImplementation(async (_command, args) =>
    args.includes("--version") ? "v24.5.0" : "",
  );
});

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  vi.unstubAllEnvs();
});

it("clones a stopped base, transfers source, quotes commands and deletes the clone", async () => {
  vi.stubEnv("ZAP_E2E_VM_WORKDIR", "/tmp/project with 'quotes'");
  vi.stubEnv("ZAP_E2E_LOCAL_CMD", "printf '%s' 'hello world'");
  await runE2E();
  const calls = vi.mocked(runCommand).mock.calls;
  const clone = calls.find(([, args]) => args[0] === "clone")![1];
  const vm = clone.at(-1)!;
  expect(clone).toEqual([
    "clone",
    "--tty=false",
    "--mount-none",
    "zapper-e2e-base",
    vm,
  ]);

  expect(calls.findIndex(([, args]) => args[0] === "stop")).toBeLessThan(
    calls.findIndex(([, args]) => args[0] === "clone"),
  );

  expect(syncVmSource).toHaveBeenCalledWith(
    expect.any(String),
    vm,
    "/tmp/project with 'quotes'",
    expect.any(AbortSignal),
  );

  const command = calls.find(([, args]) => args.includes("-lc"))![1].at(-1)!;
  // Check the composed command with a real shell parser.
  expect(
    execFileSync("bash", ["-n", "-c", command], { encoding: "utf8" }),
  ).toBe("");

  expect(calls.at(-1)![1]).toEqual(["delete", "--force", vm]);
});

it("deletes the clone when transfer fails, and preserves it only when requested", async () => {
  vi.mocked(syncVmSource).mockRejectedValue(new Error("transfer failed"));
  await expect(runE2E()).rejects.toThrow("transfer failed");
  expect(vi.mocked(runCommand).mock.calls.at(-1)![1][0]).toBe("delete");
  vi.mocked(runCommand).mockClear();
  vi.stubEnv("ZAP_E2E_KEEP_VM", "1");
  await expect(runE2E()).rejects.toThrow("transfer failed");
  expect(
    vi.mocked(runCommand).mock.calls.some(([, args]) => args[0] === "delete"),
  ).toBe(false);
});

it("rejects missing or stale bases unless local fallback is explicit", async () => {
  vi.mocked(getVmStatus).mockResolvedValue(undefined);
  await expect(runE2E()).rejects.toThrow("missing");
  expect(runCommand).not.toHaveBeenCalled();
  vi.stubEnv("ZAP_E2E_ALLOW_LOCAL_FALLBACK", "1");
  await runE2E();
  expect(runCommand).toHaveBeenCalledWith(
    "bash",
    ["-lc", "pnpm run test:e2e:local"],
    { cwd: expect.any(String) },
  );

  vi.stubEnv("ZAP_E2E_ALLOW_LOCAL_FALLBACK", "0");
  vi.mocked(getVmStatus).mockResolvedValue("Running");
  vi.mocked(runCommand).mockResolvedValue("v20.0.0");
  await expect(runE2E()).rejects.toThrow("not provisioned");
  expect(vi.mocked(runCommand).mock.calls.at(-1)![1]).toEqual([
    "stop",
    "zapper-e2e-base",
  ]);
});

it("rejects unsafe working directories before touching a VM", async () => {
  for (const directory of ["/", "/tmp/..", "relative"]) {
    vi.stubEnv("ZAP_E2E_VM_WORKDIR", directory);
    await expect(runE2E()).rejects.toThrow("absolute working directory");
  }

  expect(getVmStatus).not.toHaveBeenCalled();
});

it("preserves the real local child exit status", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("../e2eRun.ts", import.meta.url)),
    ],
    {
      env: {
        ...process.env,
        ZAP_E2E_FORCE_LOCAL: "1",
        ZAP_E2E_LOCAL_CMD: "exit 7",
      },
      encoding: "utf8",
    },
  );

  expect(result.status).toBe(7);
  expect(result.stderr).toContain("exited with 7");
});
