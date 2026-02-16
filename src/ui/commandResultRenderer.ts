import { CommandResult } from "../commands/CommandResult";
import { renderer } from "./renderer";

export interface RenderCommandResultOptions {
  json: boolean;
}

function toJsonPayload(result: CommandResult): unknown {
  switch (result.kind) {
    case "status":
      return renderer.status.toJson(result.statusResult);
    case "tasks.list":
      return renderer.tasks.toJson(result.tasks);
    case "tasks.params":
      return renderer.tasks.paramsToJson(result.task, result.delimiters);
    case "profiles.list":
      return renderer.profiles.toJson(result.profiles);
    case "environments.list":
      return renderer.environments.toJson(result.environments);
    case "env.service":
      return result.resolvedEnv;
    case "state":
      return result.state;
    case "config":
      return result.filteredConfig;
    case "isolation.enabled":
      return { instanceId: result.instanceId };
    case "services.action":
      return {
        action: result.action,
        services: result.services,
      };
    case "clone.completed":
      return { services: result.services };
    case "reset":
      return { status: result.status };
    case "kill":
      return {
        status: result.status,
        projectName: result.projectName,
        prefix: result.prefix,
        pm2: result.pm2,
        containers: result.containers,
      };
    case "launch.opened":
      return { url: result.url };
    case "git.checkout.completed":
      return { branch: result.branch };
    case "git.pull.completed":
      return { action: "pull" };
    case "git.status.completed":
      return { action: "status" };
    case "git.stash.completed":
      return { action: "stash" };
    case "profiles.picker":
      return {
        profiles: result.profiles,
        activeProfile: result.activeProfile,
      };
    case "profiles.enabled":
      return {
        action: "enabled",
        profile: result.profile,
        startedServices: result.startedServices,
      };
    case "profiles.disabled":
      return {
        action: "disabled",
        activeProfile: result.activeProfile,
      };
    case "environments.picker":
      return {
        environments: result.environments,
        activeEnvironment: result.activeEnvironment,
      };
    case "environments.enabled":
      return {
        action: "enabled",
        environment: result.environment,
      };
    case "environments.disabled":
      return {
        action: "disabled",
        activeEnvironment: result.activeEnvironment,
      };
  }
}

export function renderCommandResult(
  result: CommandResult,
  options: RenderCommandResultOptions,
): void {
  // Preserve existing behavior for command modes that are intentionally machine-first.
  if (
    options.json ||
    result.kind === "tasks.params" ||
    result.kind === "state"
  ) {
    const payload = toJsonPayload(result);
    const pretty = result.kind === "config" ? result.pretty : false;
    renderer.machine.json(payload, pretty);
    return;
  }

  switch (result.kind) {
    case "status":
      renderer.log.report(
        renderer.status.toText(result.statusResult, result.context),
      );
      return;
    case "tasks.list":
      renderer.log.report(renderer.tasks.toText(result.tasks));
      return;
    case "profiles.list":
      renderer.log.report(renderer.profiles.toText(result.profiles));
      return;
    case "environments.list":
      renderer.log.report(renderer.environments.toText(result.environments));
      return;
    case "env.service":
      renderer.machine.envMap(result.resolvedEnv);
      return;
    case "config":
      renderer.machine.json(result.filteredConfig, result.pretty);
      return;
    case "isolation.enabled":
      renderer.isolation.printEnabled(result.instanceId);
      return;
    case "launch.opened":
      renderer.log.info(`Opening ${result.url}`);
      return;
    case "reset":
      if (result.status === "aborted") {
        renderer.log.info("Aborted.");
      }
      return;
    case "kill":
      if (result.status === "aborted") {
        renderer.log.info("Aborted.");
        return;
      }
      if (result.pm2.length === 0 && result.containers.length === 0) {
        renderer.log.info(
          `No PM2 processes or Docker containers found across any instance for project ${result.projectName} (${result.prefix}.).`,
        );
        return;
      }
      renderer.log.info(
        `Killed ${result.pm2.length} PM2 process(es) and ${result.containers.length} container(s) across all instances for project ${result.projectName} (${result.prefix}.).`,
      );
      return;
    case "profiles.picker":
      renderer.log.report(
        renderer.profiles.pickerText(result.profiles, result.activeProfile),
      );
      return;
    case "profiles.enabled":
      renderer.log.info(`Enabling profile: ${result.profile}`);
      if (result.startedServices.length === 0) {
        renderer.log.info(`No services found for profile: ${result.profile}`);
      } else {
        renderer.log.info(
          `Starting services: ${result.startedServices.join(", ")}`,
        );
      }
      return;
    case "profiles.disabled":
      if (!result.activeProfile) {
        renderer.log.info("No active profile to disable");
      } else {
        renderer.log.info(`Disabling active profile: ${result.activeProfile}`);
        renderer.log.info("Active profile disabled");
        renderer.log.info("Adjusting services to match new state...");
      }
      return;
    case "environments.picker":
      renderer.log.report(
        renderer.environments.pickerText(
          result.environments,
          result.activeEnvironment,
        ),
      );
      return;
    case "environments.enabled":
      renderer.log.info(`Enabling environment: ${result.environment}`);
      renderer.log.info(
        "Environment updated. Restart services to apply new environment variables.",
      );
      return;
    case "environments.disabled":
      if (!result.activeEnvironment) {
        renderer.log.info("No active environment to disable");
      } else {
        renderer.log.info(
          `Disabling active environment: ${result.activeEnvironment}`,
        );
        renderer.log.info(
          "Environment reset to default. Restart services to apply new environment variables.",
        );
      }
      return;
    case "services.action":
    case "clone.completed":
    case "git.checkout.completed":
    case "git.pull.completed":
    case "git.status.completed":
    case "git.stash.completed":
      return;
  }
}
