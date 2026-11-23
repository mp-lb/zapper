import process from "node:process";
import console from "node:console";
import { setTimeout } from "node:timers/promises";

const serializedReport = process.env.FSSSTACK_RELEASE_RESULT;
if (!serializedReport)
  throw Error(
    "Pass the publisher's release_report output as FSSSTACK_RELEASE_RESULT.",
  );

const report: { name: string; version: string; action: string }[] =
  JSON.parse(serializedReport);

// npm scans new versions before serving their tarballs; availability can lag
// publishing by fifteen minutes or more. Keep verification bounded and visible.
const maxAttempts = 120;
const retryIntervalMs = 10000;

for (const { name, version, action } of report) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
  let published = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await globalThis.fetch(url, {
      signal: globalThis.AbortSignal.timeout(30000),
      headers: { "Cache-Control": "no-cache" },
    });

    if (response.ok) {
      const manifest = (await response.json()) as {
        version?: string;
        dist?: { tarball?: string };
      };

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

    if (attempt < maxAttempts - 1) {
      console.log(
        `Waiting for npm to serve ${name}@${version} (${attempt + 1}/${maxAttempts}); checking again in 10 seconds.`,
      );

      await setTimeout(retryIntervalMs);
    }
  }

  if (!published)
    throw Error(
      `${name}@${version} (${action}) is still not publicly installable after the availability checks. Check npm publish-time processing for this version, then rerun verification once its tarball is available; do not republish the same version.`,
    );
  console.log(`Verified public package: ${name}@${version} (${action})`);
}
