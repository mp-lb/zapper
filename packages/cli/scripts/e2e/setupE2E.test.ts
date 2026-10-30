import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getVmStatus } from "./getVmStatus";
import { runCommand } from "./runCommand";
import { setupE2E } from "./setupE2E";

vi.mock("./getVmStatus", () => ({ getVmStatus: vi.fn() }));
vi.mock("./runCommand", () => ({ runCommand: vi.fn() }));
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(process, "platform", { value: "darwin" });
  vi.stubEnv("ZAP_E2E_BASE_VM_NAME", "setup-test-base");
  vi.stubEnv("ZAP_E2E_NODE_MAJOR", undefined);
  vi.mocked(getVmStatus).mockResolvedValue(undefined);
  vi.mocked(runCommand).mockResolvedValue("");
});

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  vi.unstubAllEnvs();
});

it("provisions the project's pinned tools and stops the reusable base", async () => {
  await setupE2E();

  const major = readFileSync(
    new URL("../../../../.node-version", import.meta.url),
    "utf8",
  )
    .trim()
    .split(".")[0];

  const manifest: { packageManager: string } = JSON.parse(
    readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
  );

  const calls = vi.mocked(runCommand).mock.calls.map(([, args]) => args);
  expect(calls).toContainEqual([
    "create",
    "--name",
    "setup-test-base",
    "--tty=false",
    "--disk",
    "30",
    "template:ubuntu",
  ]);

  expect(
    calls.some((args) => args.some((arg) => arg.includes(`setup_${major}.x`))),
  ).toBe(true);

  expect(calls).toContainEqual([
    "shell",
    "setup-test-base",
    "--",
    "sudo",
    "npm",
    "install",
    "-g",
    manifest.packageManager,
  ]);

  expect(calls.at(-1)).toEqual(["stop", "setup-test-base"]);
});

it("stops the base without marking it ready when provisioning fails", async () => {
  vi.mocked(getVmStatus).mockResolvedValue("Running");
  vi.mocked(runCommand).mockImplementation(async (_command, args) => {
    if (args.includes("apt-get")) throw new Error("apt failed");
    return "";
  });

  await expect(setupE2E()).rejects.toThrow("apt failed");
  const calls = vi.mocked(runCommand).mock.calls.map(([, args]) => args);
  expect(calls.some((args) => args.includes("touch"))).toBe(false);
  expect(calls.at(-1)).toEqual(["stop", "setup-test-base"]);
});
