import { ProfilesCommand } from "./ProfilesCommand";
import { Zapper } from "../core/Zapper";
import { vi, describe, it, expect } from "vitest";

describe("ProfilesCommand", () => {
  it("should validate profile exists in available profiles list", async () => {
    const zapper = new Zapper();
    const mockContext = {
      profiles: ["admin", "production"],
      processes: [],
      containers: [],
      state: { activeProfile: undefined },
      projectRoot: "/test",
    };

    vi.spyOn(zapper, "getContext").mockReturnValue(mockContext as any);

    const command = new ProfilesCommand();
    const context = {
      zapper,
      service: "admin-app", // This profile does not exist
      options: {},
    };

    // Should throw an error because "admin-app" is not in the profiles list
    await expect(command.execute(context)).rejects.toThrow(
      "Profile not found: admin-app. Available profiles: admin, production"
    );
  });

  it("should throw error when profile is not found", async () => {
    const zapper = new Zapper();
    const mockContext = {
      profiles: ["production", "development"],
      processes: [],
      containers: [],
      state: { activeProfile: undefined },
      projectRoot: "/test",
    };

    vi.spyOn(zapper, "getContext").mockReturnValue(mockContext as any);

    const command = new ProfilesCommand();
    const context = {
      zapper,
      service: "nonexistent",
      options: {},
    };

    await expect(command.execute(context)).rejects.toThrow(
      "Profile not found: nonexistent. Available profiles: production, development"
    );
  });
});