import { appendFileSync } from "node:fs";

const fixture = process.env.REGISTRY_FIXTURE;
if (!fixture)
  throw new Error("This registry mock requires an isolated test fixture");

globalThis.fetch = async (input, options) => {
  const url = String(input);
  appendFileSync(fixture, `${options?.method ?? "GET"} ${url}\n`);
  if (process.env.REGISTRY_FIXTURE_FAIL === "1")
    return new Response(null, { status: 500 });
  if (url === "https://registry.npmjs.org/%40fixture%2Fexample/1.0.1")
    return Response.json({
      version: "1.0.1",
      dist: { tarball: "https://fixture.invalid/package.tgz" },
    });
  if (
    url === "https://fixture.invalid/package.tgz" &&
    options?.method === "HEAD"
  )
    return new Response(null, { status: 200 });
  throw new Error(`Unexpected registry mock request: ${url}`);
};
