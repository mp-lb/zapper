import { spawn } from "child_process";

export function runDocker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      error += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Docker command failed: ${error}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to run Docker command: ${err.message}`));
    });
  });
}
