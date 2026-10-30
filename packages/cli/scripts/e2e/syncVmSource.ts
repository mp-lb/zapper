import { spawn } from "node:child_process";

export const syncVmSource = async (
  root: string,
  vm: string,
  directory: string,
  signal?: AbortSignal,
) => {
  const tar = spawn(
    "tar",
    [
      "-C",
      root,
      "--disable-copyfile",
      "--no-mac-metadata",
      "--no-xattrs",
      "--exclude=.git",
      "--exclude=node_modules",
      "--exclude=.zap",
      "-cf",
      "-",
      ".",
    ],
    {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
      stdio: ["ignore", "pipe", "inherit"],
      signal,
    },
  );

  const receiver = spawn(
    "limactl",
    ["shell", vm, "--", "tar", "-xf", "-", "-C", directory],
    { stdio: ["pipe", "inherit", "inherit"], signal },
  );

  tar.stdout.pipe(receiver.stdin);
  // A failed receiver may close its input before tar sees its exit status.
  receiver.stdin.on("error", () => tar.kill("SIGTERM"));

  const complete = (child: typeof tar | typeof receiver) =>
    new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, exitSignal) =>
        code === 0
          ? resolve()
          : reject(
              new Error(`VM source transfer failed: ${exitSignal ?? code}`),
            ),
      );
    });

  try {
    await Promise.all([complete(tar), complete(receiver)]);
  } finally {
    if (tar.exitCode === null) tar.kill("SIGTERM");
    if (receiver.exitCode === null) receiver.kill("SIGTERM");
  }
};
