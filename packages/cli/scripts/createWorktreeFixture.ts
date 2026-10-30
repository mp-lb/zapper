import { createWorktreeFixture } from "./e2e/createWorktreeFixture";

const [outputRoot, name] = process.argv.slice(2);
if (!outputRoot)
  throw new Error("Usage: zap t e2e-fixture -- <output-root> [fixture-name]");
const { mainDir, worktreeDir } = createWorktreeFixture(outputRoot, name);
console.log(`MAIN_DIR=${mainDir}`);
console.log(`WORKTREE_DIR=${worktreeDir}`);
