import process from "node:process";
import console from "node:console";
import { setTimeout } from "node:timers/promises";

const serializedReport = process.env.FSSSTACK_RELEASE_RESULT;
if (!serializedReport)
  throw Error(
    "Pass the publisher's release_report output as FSSSTACK_RELEASE_RESULT.",
  );
const report = JSON.parse(serializedReport);

for (const { name, version, action } of report) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
  let published = false;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await globalThis.fetch(url, {
      signal: globalThis.AbortSignal.timeout(30000),
      headers: { "Cache-Control": "no-cache" },
    });

    if (response.ok) {
      const manifest = await response.json();

      if (manifest.version === version && manifest.dist?.tarball) {
        const tarball = await globalThis.fetch(manifest.dist.tarball, {
          method: "HEAD",
          signal: globalThis.AbortSignal.timeout(30000),
        });

        published = tarball.ok;
      }
    } else if (response.status !== 404) {
      throw Error(`Registry verification returned HTTP ${response.status}.`);
    }

    if (published) break;
    if (attempt < 29) await setTimeout(10000);
  }

  if (!published)
    throw Error(`${name}@${version} (${action}) is not publicly installable.`);
  console.log(`Verified public package: ${name}@${version} (${action})`);
}
