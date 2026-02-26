import { renderer } from "../ui/renderer";
import type { StatusResult } from "../core/getStatus";
import type { Context, Task } from "../types/Context";
import { logger, LogLevel } from "../utils/logger";
import { ConfigValidationError, ServiceNotFoundError } from "../errors";

function section(title: string): void {
  renderer.machine.line("");
  renderer.machine.line(`==================== ${title} ====================`);
}

function main(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("rendererVibeSheet is for local development only.");
  }

  logger.setLevel(LogLevel.DEBUG);

  const contextHeader: Context = {
    projectName: "zapper-playground",
    projectRoot: process.cwd(),
    envFiles: [],
    environments: ["default", "staging", "sandbox"],
    gitMethod: "ssh",
    taskDelimiters: ["{{", "}}"],
    instanceId: "dev42z",
    processes: [],
    containers: [],
    tasks: [],
    links: [],
    profiles: [],
    state: { lastUpdated: new Date().toISOString() },
  };

  const statusResult: StatusResult = {
    native: [
      {
        service: "api",
        rawName: "zapper-playground.dev42z.api",
        status: "up",
        type: "native",
        enabled: true,
      },
      {
        service: "worker",
        rawName: "zapper-playground.dev42z.worker",
        status: "pending",
        type: "native",
        enabled: true,
      },
      {
        service: "legacy-sync",
        rawName: "zapper-playground.dev42z.legacy-sync",
        status: "down",
        type: "native",
        enabled: false,
      },
    ],
    docker: [
      {
        service: "postgres",
        rawName: "zapper-playground.dev42z.postgres",
        status: "up",
        type: "docker",
        enabled: true,
      },
      {
        service: "redis",
        rawName: "zapper-playground.dev42z.redis",
        status: "down",
        type: "docker",
        enabled: true,
      },
    ],
  };

  const tasks: Task[] = [
    {
      name: "dev",
      desc: "Run API in watch mode",
      aliases: ["serve", "api"],
      cmds: ["pnpm --filter api dev --port {{port}}"],
      params: [
        { name: "port", desc: "Port for API", default: "3000" },
        { name: "profile", desc: "Optional runtime profile" },
      ],
    },
    {
      name: "test",
      desc: "Run service tests with pass-through args",
      cmds: ["pnpm --filter api test {{REST}}"],
      aliases: ["t"],
    },
  ];

  const profiles = ["default", "dev", "ops"];
  const environments = ["default", "staging", "qa"];

  section("Renderer Vibe Sheet");

  section("Line Logs");
  renderer.log.info("Starting api service");
  renderer.log.success("API started in 1.2s");
  renderer.log.warn("Healthcheck is slower than expected");
  renderer.log.error("Could not connect to upstream", {
    data: { retryInSeconds: 5, endpoint: "http://localhost:8080/health" },
  });
  renderer.log.debug("Planner wave details", {
    data: { wave: 2, actions: ["api", "worker"] },
  });

  section("Status Report");
  renderer.log.report(renderer.status.toText(statusResult, contextHeader));

  section("Task Report");
  renderer.log.report(renderer.tasks.toText(tasks));

  section("Profile Report");
  renderer.log.report(renderer.profiles.toText(profiles));
  renderer.log.report(renderer.profiles.pickerText(profiles, "dev"));

  section("Environment Report");
  renderer.log.report(renderer.environments.toText(environments));
  renderer.log.report(
    renderer.environments.pickerText(environments, "staging"),
  );

  section("Warnings");
  renderer.warnings.printUnisolatedWorktree();

  section("Errors");
  renderer.errors.print(
    new ConfigValidationError([
      "native.api.cmd is required",
      "docker.redis.image must be a string",
    ]),
  );
  renderer.errors.print(new ServiceNotFoundError("dashboard"));
  renderer.errors.print(new Error("Unexpected low-level runtime failure"));
}

main();
