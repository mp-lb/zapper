import { CommandError } from "./e2e/CommandError";
import { runE2E } from "./e2e/runE2E";

try {
  await runE2E();
} catch (error) {
  console.error(
    `[e2e] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );

  process.exitCode = error instanceof CommandError ? error.exitCode : 1;
}
