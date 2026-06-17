import { describe, expect, it } from "vitest";
import path from "path";
import { ZodConfigValidator } from "../config/ZodConfigValidator";
import {
  DEFAULT_PROFILE_NAME,
  listProfileNames,
  resolveProfile,
} from "./profileResolver";

describe("profileResolver", () => {
  const projectRoot = path.join("/tmp", "zapper-profile-test");

  it("returns undefined when the config has no stack profiles", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(resolveProfile(config, { projectRoot })).toBeUndefined();
  });

  it("resolves the default stack profile when no profile is selected", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      profiles: {
        default: {
          env_files: [".env.local", ".env"],
          services: "*",
          isolate: false,
        },
      },
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(resolveProfile(config, { projectRoot })).toEqual({
      name: DEFAULT_PROFILE_NAME,
      envFiles: [
        path.join(projectRoot, ".env.local"),
        path.join(projectRoot, ".env"),
      ],
      services: "*",
      isolate: false,
    });
  });

  it("uses explicit profileName before selectedProfileName", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      profiles: {
        default: {},
        proddata: {
          env_files: [".env.proddata"],
          services: "*",
        },
        e2e: {
          env_files: [".env.e2e"],
          services: ["api"],
          isolate: true,
        },
      },
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(
      resolveProfile(config, {
        projectRoot,
        profileName: "e2e",
        selectedProfileName: "proddata",
      }),
    ).toEqual({
      name: "e2e",
      envFiles: [path.join(projectRoot, ".env.e2e")],
      services: ["api"],
      isolate: true,
    });
  });

  it("defaults profile fields when they are omitted", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      profiles: {
        default: {},
      },
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(resolveProfile(config, { projectRoot })).toEqual({
      name: "default",
      envFiles: [],
      services: "*",
      isolate: false,
    });
  });

  it("rejects profile service names that are not configured services", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      profiles: {
        default: {
          services: ["api", "worker"],
        },
      },
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(() => resolveProfile(config, { projectRoot })).toThrow(
      'Profile "default" references unknown service(s): worker',
    );
  });

  it("lists profile names in sorted order", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      profiles: {
        proddata: {},
        default: {},
        e2e: {},
      },
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(listProfileNames(config)).toEqual(["default", "e2e", "proddata"]);
  });

  it("reports available profiles when the selected profile does not exist", () => {
    const config = ZodConfigValidator.validate({
      project: "myapp",
      profiles: {
        default: {},
        e2e: {},
      },
      native: {
        api: { cmd: "pnpm dev" },
      },
    });

    expect(() =>
      resolveProfile(config, { projectRoot, profileName: "missing" }),
    ).toThrow("Profile not found: missing. Available profiles: default, e2e");
  });
});
