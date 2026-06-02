import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommanderCli } from "./CommanderCli";
import { Zapper } from "../core/Zapper";
import { Context } from "../types/index";

describe("CommanderCli - Profile Alias Resolution", () => {
  let cli: CommanderCli;

  beforeEach(() => {
    cli = new CommanderCli();

    // Scenario: a service "admin-app" has alias "admin", AND there is no
    // profile named "admin". Service-alias resolution must NOT be applied to
    // the profile target — `profile use admin` should look up the profile
    // "admin" verbatim, never the resolved service name "admin-app".
    const mockContext: Context = {
      projectName: "test",
      profiles: ["production"],
      processes: [],
      containers: [],
      tasks: [],
      environments: [],
      links: [],
      instanceKey: "default",
      state: {},
      projectRoot: "/test",
    };

    // The CLI constructs its own Zapper; make every instance use our mock.
    vi.spyOn(Zapper.prototype, "getContext").mockReturnValue(mockContext);
    vi.spyOn(Zapper.prototype, "loadConfig").mockResolvedValue();
    vi.spyOn(Zapper.prototype, "resolveServiceName").mockImplementation(
      (name: string) => (name === "admin" ? "admin-app" : name),
    );
  });

  it("does not apply service-alias resolution to the profile target", async () => {
    // "admin" is not a configured profile, so this rejects with a not-found
    // error. The error must reference "admin" (the literal target), never the
    // alias-resolved service name "admin-app".
    await expect(
      cli.parse(["node", "test", "profile", "use", "admin"]),
    ).rejects.toThrow(/Profile not found: admin\b/);

    await expect(
      cli.parse(["node", "test", "profile", "use", "admin"]),
    ).rejects.not.toThrow(/admin-app/);
  });
});
