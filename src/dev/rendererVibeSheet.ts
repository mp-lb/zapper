import { renderer } from "../ui/renderer";
import type { StatusResult } from "../core/getStatus";
import type { Context, Task } from "../types/Context";
import type { ServiceListResult } from "../core/getServiceList";
import { logger, LogLevel } from "../utils/logger";
import { ConfigValidationError, ServiceNotFoundError } from "../errors";

function section(title: string): void {
  renderer.machine.line("");
  renderer.heading.print(title);
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
    instanceKey: "default",
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

  const serviceList: ServiceListResult = {
    services: [
      {
        type: "native",
        service: "api",
        status: "up",
        ports: ["API_PORT=3000", "METRICS_PORT=9090"],
        cwd: "/workspace/apps/api",
        cmd: "pnpm dev",
      },
      {
        type: "native",
        service: "worker",
        status: "pending",
        ports: [],
        cwd: "/workspace/apps/worker",
        cmd: "pnpm worker",
      },
      {
        type: "docker",
        service: "postgres",
        status: "up",
        ports: ["5432:5432"],
        cmd: "postgres:16",
      },
      {
        type: "docker",
        service: "redis",
        status: "down",
        ports: ["6379:6379"],
        cmd: "redis:7",
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

  section("Status");
  renderer.log.report(renderer.status.toText(statusResult, contextHeader));

  section("Services (zap ls)");
  renderer.log.report(renderer.list.toText(serviceList, contextHeader));

  section("Tasks");
  renderer.log.report(renderer.tasks.toText(tasks));

  section("Profiles");
  renderer.log.report(renderer.profiles.toText(profiles));
  renderer.log.report(renderer.profiles.pickerText(profiles, "dev"));

  section("Environments");
  renderer.log.report(renderer.environments.toText(environments));
  renderer.log.report(
    renderer.environments.pickerText(environments, "staging"),
  );

  section("Resource List View");
  renderer.log.report(
    renderer.command.globalListText(
      [
        {
          name: "zapper-playground",
          pm2: ["zap.zapper-playground.api", "zap.zapper-playground.worker"],
          containers: ["zap.zapper-playground.postgres"],
        },
        {
          name: "hyperstore",
          pm2: ["zap.hyperstore.web"],
          containers: ["zap.hyperstore.redis"],
        },
      ],
      true,
    ),
  );

  section("Confirmation Question");
  renderer.machine.line(
    renderer.confirm.promptText(renderer.confirm.deleteResourcesPromptText()),
  );

  section("Confirmation Flow");
  renderer.log.info(
    renderer.confirm.globalKillAllPromptText({
      projectCount: 3,
      projectNames: ["zapper-playground", "hyperstore", "newbird"],
      pm2Count: 7,
      containerCount: 2,
    }),
  );
  renderer.log.report(
    renderer.command.globalListText(
      [
        {
          name: "zapper-playground",
          pm2: ["zap.zapper-playground.api", "zap.zapper-playground.worker"],
          containers: ["zap.zapper-playground.postgres"],
        },
        {
          name: "hyperstore",
          pm2: ["zap.hyperstore.web"],
          containers: ["zap.hyperstore.redis"],
        },
        {
          name: "newbird",
          pm2: [],
          containers: [],
        },
      ],
      true,
    ),
  );
  renderer.machine.line(
    renderer.confirm.promptText(renderer.confirm.deleteResourcesPromptText()),
  );

  section("Command Messages");
  renderer.log.info(renderer.command.abortedText());
  renderer.log.info(renderer.command.openingText("https://example.com/docs"));
  renderer.log.info(
    renderer.command.killCompletedText({
      projectName: "zapper-playground",
      prefix: "zap.zapper-playground",
      pm2Count: 3,
      containerCount: 2,
    }),
  );
  renderer.log.report(
    renderer.command.globalListText(
      [
        {
          name: "zapper-playground",
          pm2: ["zap.zapper-playground.api", "zap.zapper-playground.worker"],
          containers: ["zap.zapper-playground.postgres"],
        },
        {
          name: "old-sandbox",
          pm2: [],
          containers: [],
        },
      ],
      true,
    ),
  );

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
