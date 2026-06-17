import { spawn } from "child_process";
import { randomBytes } from "crypto";

export type ShellEnvCaptureResult =
  | { ok: true; env: Record<string, string> }
  | { ok: false; error: string };

const CAPTURE_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

// One capture per shell binary per zap invocation: every process restarted in
// the same `zap up` reuses the result instead of respawning a login shell.
const captures = new Map<string, Promise<ShellEnvCaptureResult>>();

/**
 * Captures the environment of the user's login shell by spawning it once with
 * `-ilc` (login + interactive, so rc files that init version managers run) and
 * printing `env -0` between unique markers. Marker delimiting discards any
 * stdout noise rc files produce; `env -0` keeps multiline values intact.
 */
export function captureShellEnv(
  shell: string,
  timeoutMs: number = CAPTURE_TIMEOUT_MS,
): Promise<ShellEnvCaptureResult> {
  const cached = captures.get(shell);
  if (cached) return cached;

  const result = spawnShellCapture(shell, timeoutMs);
  captures.set(shell, result);
  return result;
}

export function clearShellEnvCaptureCache(): void {
  captures.clear();
}

function spawnShellCapture(
  shell: string,
  timeoutMs: number,
): Promise<ShellEnvCaptureResult> {
  const marker = `ZAP_ENV_${randomBytes(8).toString("hex")}`;
  const script = `printf '%s' '${marker}'; command env -0; printf '%s' '${marker}'`;

  return new Promise((resolve) => {
    let child;

    try {
      child = spawn(shell, ["-ilc", script], {
        // No TTY and no stdin, so an interactive shell cannot block on input
        stdio: ["ignore", "pipe", "ignore"],
        detached: true,
      });
    } catch (error) {
      resolve({ ok: false, error: (error as Error).message });
      return;
    }

    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (result: ShellEnvCaptureResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      // Negative pid kills the whole process group, including anything an rc
      // file left running.
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }

      finish({ ok: false, error: `timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout!.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;

      if (outputBytes > MAX_OUTPUT_BYTES) {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }

        finish({ ok: false, error: "produced too much output" });
        return;
      }

      chunks.push(chunk);
    });

    child.on("error", (error) => {
      finish({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        finish({ ok: false, error: `exited with code ${code}` });
        return;
      }

      const env = parseMarkedEnvOutput(
        Buffer.concat(chunks).toString("utf8"),
        marker,
      );

      if (!env) {
        finish({ ok: false, error: "could not parse environment output" });
        return;
      }

      finish({ ok: true, env });
    });
  });
}

/**
 * Extracts the null-delimited `env -0` block between the two markers and
 * parses it into a map. Returns null when the markers are missing or nothing
 * parseable sits between them.
 */
export function parseMarkedEnvOutput(
  output: string,
  marker: string,
): Record<string, string> | null {
  const start = output.indexOf(marker);
  const end = output.lastIndexOf(marker);
  if (start === -1 || end <= start) return null;

  const block = output.slice(start + marker.length, end);
  const env: Record<string, string> = {};

  for (const entry of block.split("\0")) {
    if (!entry) continue;

    const separator = entry.indexOf("=");
    if (separator <= 0) continue;

    env[entry.slice(0, separator)] = entry.slice(separator + 1);
  }

  return Object.keys(env).length > 0 ? env : null;
}
