import { spawn } from "node:child_process";
import { CommandError } from "./CommandError";

export const runCommand = (
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    quiet?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      signal: options.signal,
      stdio: ["inherit", options.quiet ? "pipe" : "inherit", "inherit"],
    });

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(
          new CommandError(
            `${command} exited with ${signal ?? code}`,
            code ??
              (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1),
          ),
        );
    });
  });
