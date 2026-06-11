import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  expandVars,
  expandVarsDeep,
  renderRefs,
  collectOutputRefs,
  maskSecrets,
  kebabKeysToSnake,
} from "./template";
import { resolveServiceEnv, bareEnvKeys } from "./env";
import { resolveModules } from "./modules";
import { renderDeployment } from "./render";
import { NetworkConfig, ProjectManifest, deployBlockSchema } from "./schemas";

describe("template", () => {
  it("expands {var} placeholders", () => {
    expect(
      expandVars("{region}-x/{slug}", { region: "r1", slug: "p" }, "t"),
    ).toBe("r1-x/p");
  });

  it("throws on unknown vars, naming the available ones", () => {
    expect(() => expandVars("{nope}", { slug: "p" }, "registry")).toThrow(
      /\{nope\}.*registry.*slug/s,
    );
  });

  it("expands deep through maps and arrays", () => {
    expect(
      expandVarsDeep({ a: ["{x}"], b: { c: "{x}" } }, { x: "1" }, "t"),
    ).toEqual({ a: ["1"], b: { c: "1" } });
  });

  it("substitutes {{ns.key}} references", () => {
    const out = renderRefs(
      "token={{cred.T}} p={{params.deploy-path}}",
      (ns, key) => `${ns}:${key}`,
      "t",
    );

    expect(out).toBe("token=cred:T p=params:deploy-path");
  });

  it("collects output refs", () => {
    expect(collectOutputRefs("{{output.a}} {{cred.b}} {{output.c_d}}")).toEqual(
      ["a", "c_d"],
    );
  });

  it("masks secret values", () => {
    expect(maskSecrets("x sekret y", ["sekret", ""])).toBe("x *** y");
  });

  it("snake-cases top-level keys only", () => {
    expect(
      kebabKeysToSnake({ "min-instances": 1, env: { "a-b": "v" } }),
    ).toEqual({ min_instances: 1, env: { "a-b": "v" } });
  });
});

describe("env entries", () => {
  it("splits literals on the first = and whitelists bare keys", () => {
    const env = resolveServiceEnv(
      ["A", "B=x=y", "C="],
      { A: "from-pool" },
      "svc",
    );

    expect(env).toEqual({ A: "from-pool", B: "x=y", C: "" });
  });

  it("errors on bare keys missing from the pool", () => {
    expect(() => resolveServiceEnv(["MISSING"], {}, "svc")).toThrow(
      /svc.*MISSING/,
    );
  });

  it("bareEnvKeys ignores literals", () => {
    expect(bareEnvKeys(["A", "B=1"])).toEqual(["A"]);
  });
});

function tempModuleLib(): string {
  const dir = mkdtempSync(join(tmpdir(), "arc-test-lib-"));

  mkdirSync(join(dir, "web"));
  writeFileSync(join(dir, "web", "main.tf"), "");
  writeFileSync(
    join(dir, "web", "module.yaml"),
    [
      "action: container",
      "defaults:",
      '  name: "{slug}-{service}"',
      "hooks:",
      "  post-apply:",
      "    - name: upload",
      "      env:",
      '        PROJECT_ID: "{{output.project_id}}"',
      "      run: echo done",
    ].join("\n"),
  );

  mkdirSync(join(dir, "binding"));
  writeFileSync(join(dir, "binding", "main.tf"), "");
  writeFileSync(
    join(dir, "binding", "module.yaml"),
    ["env:", '  DB_URL: "{{output.url}}"'].join("\n"),
  );

  mkdirSync(join(dir, "factory"));
  writeFileSync(join(dir, "factory", "main.tf"), "");

  return dir;
}

function testNetwork(modulesDir: string): NetworkConfig {
  return {
    name: "testnet",
    dns: { zone: "example.com" },
    env: { resolver: "true", "public-file": ".env.production" },
    backend: { gcs: { bucket: "b", prefix: "state/{slug}" } },
    providers: {
      google: {
        source: "hashicorp/google",
        version: "~> 5.0",
        config: { project: "{gcp-project}", region: "{region}" },
      },
    },
    moduleDefaults: { web: { region: "{region}" } },
    registry: "{region}-docker.example/{gcp-project}/{slug}",
    modulesDir,
    vars: { region: "r1", "gcp-project": "acme-{slug}" },
  };
}

function testManifest(): ProjectManifest {
  return {
    slug: "proj",
    deploy: deployBlockSchema.parse({
      project: {
        gcp: { module: "factory", "project-id": "acme-proj" },
      },
      services: {
        api: {
          module: "web",
          domain: "api.example.com",
          "min-instances": 2,
          env: ["A", "B=lit"],
        },
        db: { module: "binding" },
      },
    }),
    localServiceNames: [],
  };
}

describe("renderDeployment", () => {
  const lib = tempModuleLib();
  const network = testNetwork(lib);
  const manifest = testManifest();

  const deployment = renderDeployment({
    manifest,
    network,
    creds: {},
    envPool: { A: "a-value", UNUSED: "x" },
    imageTag: "tag1",
    instances: resolveModules(manifest, lib, "/nonexistent"),
  });

  const main = JSON.parse(
    readFileSync(join(deployment.dir, "main.tf.json"), "utf8"),
  );

  it("passes params through kebab→snake with merge order", () => {
    expect(main.module.svc_api.min_instances).toBe(2);
    expect(main.module.svc_api.region).toBe("r1");
    expect(main.module.svc_api.name).toBe("proj-api");
  });

  it("keeps reserved keys out of terraform params", () => {
    expect(main.module.svc_api.module).toBeUndefined();
    expect(main.module.prj_gcp.project_id).toBe("acme-proj");
  });

  it("wires domain + dns_zone and computes the image from the registry template", () => {
    expect(main.module.svc_api.domain).toBe("api.example.com");
    expect(main.module.svc_api.dns_zone).toBe("example.com");
    expect(main.module.svc_api.image).toBe(
      "r1-docker.example/acme-proj/proj/api:tag1",
    );

    expect(deployment.serviceUrls).toEqual({ api: "https://api.example.com" });
  });

  it("injects sibling module env into container services", () => {
    expect(main.module.svc_api.env).toEqual({
      A: "a-value",
      B: "lit",
      DB_URL: "${module.svc_db.url}",
    });

    expect(main.module.svc_db.env).toBeUndefined();
  });

  it("renders backend and providers with vars and stages project modules", () => {
    expect(main.terraform.backend.gcs.prefix).toBe("state/proj");
    expect(main.provider.google.project).toBe("acme-proj");
    expect(deployment.projectTargets).toEqual(["module.prj_gcp"]);
  });

  it("auto-wires root outputs for hook {{output.*}} references", () => {
    expect(
      main.output.svc_api_PROJECT_ID ?? main.output.svc_api_project_id,
    ).toEqual({
      value: "${module.svc_api.project_id}",
      sensitive: true,
    });
  });
});
