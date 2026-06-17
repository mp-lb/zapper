import { describe, expect, it, vi } from "vitest";
import { createZapperFetchClient } from "./fetchClient";

describe("createZapperFetchClient", () => {
  it("posts explicit Zapper client methods to a supplied endpoint", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ projectName: "demo" }), { status: 200 }),
    );

    const client = createZapperFetchClient({
      endpoint: "/api/zapper",
      fetch: fetchImpl,
      headers: { authorization: "Bearer local" },
    });

    await expect(client.getProject({ dir: "/repo/demo" })).resolves.toEqual({
      projectName: "demo",
    });

    expect(fetchImpl).toHaveBeenCalledWith("/api/zapper", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer local",
      },
      body: JSON.stringify({
        method: "getProject",
        query: { dir: "/repo/demo" },
      }),
    });
  });

  it("turns failed fetch responses into errors", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "denied" }), { status: 403 }),
    );

    const client = createZapperFetchClient({
      endpoint: "/api/zapper",
      fetch: fetchImpl,
    });

    await expect(client.up({ dir: "/repo/demo" })).rejects.toThrow("denied");
  });
});
