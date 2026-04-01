import { CommandResult } from "../commands/CommandResult";
import { renderer } from "./renderer";

export interface RenderCommandResultOptions {
  json: boolean;
}

function toJsonPayload(result: CommandResult): unknown {
  switch (result.kind) {
    case "status":
      return renderer.status.toJson(result.statusResult);
    case "list":
      return renderer.list.toJson(result.listResult);
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
    case "links.list":
      return renderer.links.toJson(result.links);
    case "home.value":
      return { value: result.value };
    case "notes.value":
      return { value: result.value };
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
    case "global.list":
      return {
        allProjects: result.allProjects,
        projects: result.projects,
      };
    case "global.kill":
      return {
        status: result.status,
        allProjects: result.allProjects,
        projects: result.projects,
      };
    case "init":
      return {
        isolated: result.isolated,
        instanceKey: result.instanceKey,
        instanceId: result.instanceId,
        ports: result.ports,
        path: result.path,
        randomized: result.randomized,
        warningShown: result.warningShown,
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
    case "list":
      renderer.log.report(
        renderer.list.toText(result.listResult, result.context),
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
    case "launch.opened":
      renderer.log.info(renderer.command.openingText(result.url));
      return;
    case "links.list":
      renderer.log.report(renderer.links.toText(result.links));
      return;
    case "home.value":
      renderer.log.report(result.value);
      return;
    case "notes.value":
      renderer.log.report(result.value);
      return;
    case "reset":
      if (result.status === "aborted") {
        renderer.log.info(renderer.command.abortedText());
      }
      return;
    case "kill":
      if (result.status === "aborted") {
        renderer.log.info(renderer.command.abortedText());
        return;
      }
      if (result.pm2.length === 0 && result.containers.length === 0) {
        renderer.log.info(
          renderer.command.killNoResourcesText(
            result.projectName,
            result.prefix,
          ),
        );
        return;
      }
      renderer.log.info(
        renderer.command.killCompletedText({
          projectName: result.projectName,
          prefix: result.prefix,
          pm2Count: result.pm2.length,
          containerCount: result.containers.length,
        }),
      );
      return;
    case "profiles.picker":
      renderer.log.report(
        renderer.profiles.pickerText(result.profiles, result.activeProfile),
      );
      return;
    case "profiles.enabled":
      renderer.log.info(renderer.command.profileEnabledText(result.profile));
      if (result.startedServices.length === 0) {
        renderer.log.info(
          renderer.command.profileNoServicesText(result.profile),
        );
      } else {
        renderer.log.info(
          renderer.command.profileStartingServicesText(result.startedServices),
        );
      }
      return;
    case "profiles.disabled":
      if (!result.activeProfile) {
        renderer.log.info(renderer.command.noActiveProfileToDisableText());
      } else {
        renderer.log.info(
          renderer.command.profileDisablingText(result.activeProfile),
        );
        renderer.log.info(renderer.command.profileDisabledText());
        renderer.log.info(renderer.command.profileAdjustingServicesText());
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
      renderer.log.info(
        renderer.command.environmentEnabledText(result.environment),
      );
      renderer.log.info(renderer.command.environmentUpdatedText());
      return;
    case "environments.disabled":
      if (!result.activeEnvironment) {
        renderer.log.info(renderer.command.noActiveEnvironmentToDisableText());
      } else {
        renderer.log.info(
          renderer.command.environmentDisablingText(result.activeEnvironment),
        );
        renderer.log.info(renderer.command.environmentResetText());
      }
      return;
    case "global.list":
      if (result.projects.length === 0) {
        renderer.log.info(renderer.command.noProjectsFoundText());
        return;
      }
      renderer.log.report(
        renderer.command.globalListText(result.projects, result.allProjects),
      );
      return;
    case "global.kill": {
      if (result.status === "aborted") {
        renderer.log.info(renderer.command.abortedText());
        return;
      }
      if (result.projects.length === 0) {
        if (result.allProjects) {
          renderer.log.info(renderer.command.noProjectsFoundToKillText());
        } else {
          renderer.log.info(renderer.command.noResourcesFoundToKillText());
        }
        return;
      }

      const totalPm2 = result.projects.reduce(
        (sum, p) => sum + p.pm2.length,
        0,
      );
      const totalContainers = result.projects.reduce(
        (sum, p) => sum + p.containers.length,
        0,
      );
      if (result.allProjects) {
        renderer.log.info(
          renderer.command.globalKillAllCompletedText({
            projectCount: result.projects.length,
            pm2Count: totalPm2,
            containerCount: totalContainers,
          }),
        );
      } else {
        const project = result.projects[0];
        renderer.log.info(
          renderer.command.globalKillProjectCompletedText({
            projectName: project.name,
            prefix: project.prefix,
            pm2Count: project.pm2.length,
            containerCount: project.containers.length,
          }),
        );
      }
      return;
    }
    case "init":
      renderer.log.info(
        renderer.command.initInstanceText(
          result.instanceKey,
          result.instanceId,
        ),
      );
      renderer.log.info(
        renderer.command.initPortsText({
          randomized: result.randomized,
          portCount: Object.keys(result.ports).length,
          path: result.path,
        }),
      );
      for (const [name, value] of Object.entries(result.ports)) {
        renderer.log.report(renderer.command.envAssignmentText(name, value));
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
