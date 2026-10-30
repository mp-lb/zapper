import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getVmStatus } from "./getVmStatus";
import { runCommand } from "./runCommand";
import { shellQuote } from "./shellQuote";
import { syncVmSource } from "./syncVmSource";

export const runE2E = async () => {
  const root = fileURLToPath(new URL("../../../..", import.meta.url));
  const env = process.env;
  const base = env.ZAP_E2E_BASE_VM_NAME ?? "zapper-e2e-base";
  const vm = `${env.ZAP_E2E_VM_PREFIX ?? "zapper-e2e-run"}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const directory = env.ZAP_E2E_VM_WORKDIR ?? "/tmp/zapper-e2e-src";
  const localCommand = env.ZAP_E2E_LOCAL_CMD ?? "pnpm run test:e2e:local";

  const runLocal = () =>
    runCommand("bash", ["-lc", localCommand], { cwd: root });

  const fallback = async (message: string) => {
    if (env.ZAP_E2E_ALLOW_LOCAL_FALLBACK !== "1") throw new Error(message);
    console.error(`[e2e] WARNING: ${message}`);
    await runLocal();
  };

  if (env.ZAP_E2E_FORCE_LOCAL === "1") return runLocal();
  if (process.platform !== "darwin")
    return fallback("VM E2E runner is configured for macOS only.");
  if (!isAbsolute(directory) || normalize(directory) === "/")
    throw new Error(
      "ZAP_E2E_VM_WORKDIR must name an absolute working directory, not the filesystem root.",
    );
  let status: string | undefined;

  try {
    status = await getVmStatus(base);
  } catch {
    return fallback("Lima is unavailable. Run zap t e2e-setup first.");
  }

  if (!status)
    return fallback(`Base VM '${base}' is missing. Run zap t e2e-setup first.`);
  if (status !== "Running")
    await runCommand("limactl", ["start", base], { quiet: true });

  try {
    await runCommand("limactl", [
      "shell",
      base,
      "--",
      "test",
      "-f",
      "/var/tmp/zapper-e2e-base-ready",
    ]);

    const version = await runCommand(
      "limactl",
      ["shell", base, "--", "node", "--version"],
      { quiet: true },
    );

    const expected =
      env.ZAP_E2E_NODE_MAJOR ??
      readFileSync(join(root, ".node-version"), "utf8").trim().split(".")[0];

    if (!version.startsWith(`v${expected}.`))
      throw new Error("Base VM Node version is stale.");
  } catch {
    return fallback(
      `Base VM '${base}' is not provisioned for this project. Run zap t e2e-setup first.`,
    );
  } finally {
    await runCommand("limactl", ["stop", base], { quiet: true });
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const signal = controller.signal;

  try {
    console.log(`[e2e] Creating isolated VM ${vm} from ${base}`);
    await runCommand(
      "limactl",
      ["clone", "--tty=false", "--mount-none", base, vm],
      { quiet: true, signal },
    );

    await runCommand("limactl", ["start", vm], { quiet: true, signal });
    console.log(`[e2e] Syncing project to VM ${vm}`);
    await runCommand(
      "limactl",
      ["shell", vm, "--", "rm", "-rf", "--", directory],
      { signal },
    );

    await runCommand(
      "limactl",
      ["shell", vm, "--", "mkdir", "-p", "--", directory],
      { signal },
    );

    await syncVmSource(root, vm, directory, signal);
    console.log(`[e2e] Running E2E tests in VM ${vm}`);
    await runCommand(
      "limactl",
      [
        "shell",
        vm,
        "--",
        "bash",
        "-lc",
        `cd -- ${shellQuote(directory)} && pnpm install --frozen-lockfile && exec bash -lc ${shellQuote(localCommand)}`,
      ],
      { signal },
    );
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    if (env.ZAP_E2E_KEEP_VM === "1")
      console.error(
        `[e2e] Keeping VM '${vm}' for debugging (ZAP_E2E_KEEP_VM=1).`,
      );
    else
      await runCommand("limactl", ["delete", "--force", vm], {
        quiet: true,
      }).catch(() => {});
  }
};
