import { CommandError } from "./e2e/CommandError";
import { setupE2E } from "./e2e/setupE2E";

try {
  await setupE2E();
} catch (error) {
  console.error(
    `[e2e-setup] ${error instanceof Error ? error.message : String(error)}`,
  );

  process.exitCode = error instanceof CommandError ? error.exitCode : 1;
}
