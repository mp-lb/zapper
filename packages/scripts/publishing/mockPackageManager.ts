import {
  appendFileSync,
  copyFileSync,
  cpSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [manager, ...args] = process.argv.slice(2);
const fixture = process.env.PUBLISH_FIXTURE;
if (!fixture)
  throw new Error("This mock only runs inside a publishing test fixture");
appendFileSync(join(fixture, "calls"), `${manager} ${args.join(" ")}\n`);

if (manager === "npm" && args[0] === "view") {
  console.log('"1.0.0"');
} else if (manager === "npm" && args[0] === "pack") {
  const destination = args[args.indexOf("--pack-destination") + 1];
  copyFileSync(join(fixture, "remote.tgz"), join(destination, "remote.tgz"));
  console.log("remote.tgz");
} else if (manager === "pnpm" && args[0] === "pack") {
  const destination = args[args.indexOf("--pack-destination") + 1];
  const scratch = mkdtempSync(join(tmpdir(), "forum-pack-test-"));

  try {
    cpSync(process.cwd(), join(scratch, "package"), { recursive: true });
    const tarball = join(destination, "local.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", scratch, "package"]);
    console.log(tarball);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else if (manager === "pnpm" && args[0] === "--filter") {
  if (process.env.PUBLISH_FIXTURE_FAIL_BUILD === "1") process.exit(1);
} else if (!(manager === "pnpm" && args[0] === "publish")) {
  throw new Error(`Unexpected mock invocation: ${manager} ${args.join(" ")}`);
}
