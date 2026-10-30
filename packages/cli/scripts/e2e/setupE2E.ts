import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getVmStatus } from "./getVmStatus";
import { runCommand } from "./runCommand";

export const setupE2E = async () => {
  if (process.platform !== "darwin")
    throw new Error("E2E VM setup currently supports macOS only.");
  const root = fileURLToPath(new URL("../../../..", import.meta.url));
  const base = process.env.ZAP_E2E_BASE_VM_NAME ?? "zapper-e2e-base";

  const major =
    process.env.ZAP_E2E_NODE_MAJOR ??
    readFileSync(join(root, ".node-version"), "utf8").trim().split(".")[0];

  if (!/^\d+$/.test(major))
    throw new Error("ZAP_E2E_NODE_MAJOR must be a Node major version.");

  const manifest: { packageManager: string } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );

  await runCommand("brew", ["--version"], { quiet: true });

  try {
    await runCommand("limactl", ["--version"], { quiet: true });
  } catch {
    await runCommand("brew", ["install", "lima"]);
  }

  const status = await getVmStatus(base);
  if (!status)
    await runCommand("limactl", [
      "create",
      "--name",
      base,
      "--tty=false",
      "--disk",
      "30",
      "template:ubuntu",
    ]);
  if (status !== "Running") await runCommand("limactl", ["start", base]);

  const shell = (...args: string[]) =>
    runCommand("limactl", ["shell", base, "--", ...args]);

  try {
    console.log(
      `[e2e-setup] Provisioning Node ${major} and ${manifest.packageManager} in ${base}`,
    );

    await shell("sudo", "apt-get", "update");
    await shell(
      "sudo",
      "apt-get",
      "install",
      "-y",
      "curl",
      "ca-certificates",
      "gnupg",
      "rsync",
      "build-essential",
      "git",
      "lsof",
    );

    const version = await runCommand(
      "limactl",
      ["shell", base, "--", "node", "--version"],
      { quiet: true },
    ).catch(() => "");

    if (!version.startsWith(`v${major}.`)) {
      await shell(
        "bash",
        "-o",
        "pipefail",
        "-c",
        `curl -fsSL https://deb.nodesource.com/setup_${major}.x | sudo -E bash -`,
      );

      await shell("sudo", "apt-get", "install", "-y", "nodejs");
    }

    await shell("sudo", "npm", "install", "-g", manifest.packageManager);
    await shell("sudo", "touch", "/var/tmp/zapper-e2e-base-ready");
  } finally {
    await runCommand("limactl", ["stop", base], { quiet: true });
  }

  console.log("[e2e-setup] Base VM setup complete. Run zap t e2e.");
};
