import { spawn } from "child_process";
import { renderer } from "../../ui/renderer";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

let ensureDockerPromise: Promise<void> | null = null;

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        resolve({ code: 127, stdout, stderr });
        return;
      }
      resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}`.trim() });
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function hasDockerCli(): Promise<boolean> {
  const result = await runCommand("docker", ["--version"]);
  return result.code === 0;
}

function missingDockerMessage(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return "Docker is required but not installed. Install Docker Desktop with `brew install --cask docker`, then open Docker Desktop and retry.";
  }
  if (platform === "linux") {
    return "Docker is required but not installed. Install Docker Engine + Docker CLI for your distro, then retry.";
  }
  return "Docker is required but not installed. Install Docker and retry.";
}

async function tryInstallDocker(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error(missingDockerMessage());
  }

  const brewAvailable = await runCommand("brew", ["--version"]);
  if (brewAvailable.code !== 0) {
    throw new Error(
      "Docker is required but Homebrew is not available. Install Docker Desktop manually from https://www.docker.com/products/docker-desktop/ and retry.",
    );
  }

  renderer.log.warn("Docker CLI not found. Attempting automatic install...");
  const installResult = await runCommand("brew", [
    "install",
    "--cask",
    "docker",
  ]);

  if (installResult.code !== 0) {
    const details = installResult.stderr.trim() || installResult.stdout.trim();
    throw new Error(
      `Automatic Docker installation failed.${details ? ` Details: ${details}` : ""} Install Docker Desktop manually and retry.`,
    );
  }

  const installed = await hasDockerCli();
  if (!installed) {
    throw new Error(
      "Docker install command completed, but Docker CLI is still unavailable. Open Docker Desktop and ensure `docker --version` works, then retry.",
    );
  }

  renderer.log.info(
    "Docker installed successfully. Open Docker Desktop if it is not already running.",
  );
}

export async function ensureDockerAvailable(): Promise<void> {
  if (!ensureDockerPromise) {
    ensureDockerPromise = (async () => {
      const installed = await hasDockerCli();
      if (installed) return;
      await tryInstallDocker();
    })().finally(() => {
      ensureDockerPromise = null;
    });
  }

  await ensureDockerPromise;
}
