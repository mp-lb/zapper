import { CommandResult } from "../commands/CommandResult";
import { renderer } from "./renderer";

export interface RenderCommandResultOptions {
  json: boolean;
  jsonl?: boolean;
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
    case "profiles.current":
      return {
        profile: result.profile ?? null,
        selectedProfile: result.selectedProfile ?? null,
        overrideProfile: result.overrideProfile ?? null,
      };
    case "profiles.selected":
      return {
        status: "success",
        action: "profile.use",
        profile: result.profile,
      };
    case "profiles.reset":
      return {
        status: "success",
        action: "profile.reset",
        profile: result.profile,
      };
    case "env.service":
      return result.resolvedEnv;
    case "runtime":
      return {
        project: result.project,
        services: result.services,
      };
    case "state":
      return result.state;
    case "stack.id":
      return {
        stackId: result.stackId,
        profile: result.profile,
      };
    case "stack.current":
      return result.stack;
    case "stack.list":
      return {
        stacks: result.stacks,
      };
    case "config":
      return result.filteredConfig;
    case "validate":
      return {
        valid: result.valid,
        configPath: result.configPath,
        error: result.error,
      };
    case "services.action":
      return result.report;
    case "clone.completed":
      return result.report;
    case "reset":
      return result.report;
    case "kill":
      return {
        status: result.status,
        action: "kill",
        projectName: result.projectName,
        prefix: result.prefix,
        pm2: result.pm2,
        containers: result.containers,
      };
    case "launch.opened":
      return result.report;
    case "links.list":
      return renderer.links.toJson(result.links);
    case "home.value":
      return { value: result.value };
    case "notes.value":
      return { value: result.value };
    case "git.checkout.completed":
      return {
        status: "success",
        action: "git.checkout",
        branch: result.branch,
      };
    case "git.pull.completed":
      return { status: "success", action: "git.pull" };
    case "git.status.completed":
      return { status: "success", action: "git.status" };
    case "git.stash.completed":
      return { status: "success", action: "git.stash" };
    case "global.list":
      return {
        allProjects: result.allProjects,
        projects: result.projects,
        orphans: result.orphans,
      };
    case "global.kill":
      return {
        status: result.status,
        action: "global.kill",
        allProjects: result.allProjects,
        projects: result.projects,
      };
    case "global.prune":
      return {
        status: result.status,
        action: "global.prune",
        staleProjects: renderer.system.registryProjectsToJson(
          result.staleProjects,
        ),
        removedProjects: renderer.system.registryProjectsToJson(
          result.removedProjects,
        ),
        resources: renderer.system.resourcesToJson(result.resources),
      };
    case "system.projects":
      return { projects: renderer.system.projectsToJson(result.projects) };
    case "system.registry.prune":
      return {
        status: "success",
        action: "system.registry.prune",
        removed: renderer.system.registryProjectsToJson(result.removed),
      };
    case "system.registry.forget":
      return {
        status: "success",
        action: "system.registry.forget",
        removed: result.removed
          ? renderer.system.registryProjectsToJson([result.removed])[0]
          : null,
      };
    case "system.registry.repair":
      return {
        status: "success",
        action: "system.registry.repair",
        removed: renderer.system.registryProjectsToJson(result.removed),
        projects: renderer.system.projectsToJson(result.projects),
      };
    case "system.resources.audit":
      return {
        resources: renderer.system.resourcesToJson(result.audit.resources),
      };
    case "system.resources.cleanup":
      return {
        status: result.status,
        action: "system.resources.cleanup",
        resources: renderer.system.resourcesToJson(result.cleanup.resources),
      };
    case "init":
      return {
        status: "success",
        action: "init",
        isolated: result.isolated,
        instanceKey: result.instanceKey,
        instanceId: result.instanceId,
        ports: result.ports,
        path: result.path,
        randomized: result.randomized,
        warningShown: result.warningShown,
      };
    case "instance.label":
      return {
        status: "success",
        action: result.updated ? "instance.label.set" : "instance.label.get",
        instanceKey: result.instanceKey,
        instanceId: result.instanceId,
        label: result.label ?? null,
        displayLabel: result.displayLabel,
        updated: result.updated,
      };
    case "volume.reset":
      return {
        status: "success",
        action: "volume.reset",
        instanceKey: result.instanceKey,
        volumes: result.volumes,
      };
    case "volume.prune":
      return {
        status: result.status,
        action: "volume.prune",
        instanceKey: result.instanceKey,
        volumes: result.volumes,
      };
    case "volume.list":
      return {
        status: "success",
        action: "volume.list",
        instanceKey: result.instanceKey,
        service: result.service,
        managedOnly: result.managedOnly,
        idOnly: result.idOnly,
        volumeIds: result.volumes.map((volume) => volume.name),
        volumes: result.volumes,
      };
  }
}

function formatRuntimeTools(tools: Record<string, string>): string {
  const entries = Object.entries(tools);
  if (entries.length === 0) return "-";
  return entries.map(([name, version]) => `${name}@${version}`).join(" ");
}

function formatRuntimeLine(
  name: string,
  runtime: {
    provider: string;
    tools: Record<string, string>;
    source?: string;
    warning?: string;
  },
): string {
  const source = runtime.source ? `\t${runtime.source}` : "";
  const warning = runtime.warning ? `\tWARN: ${runtime.warning}` : "";

  return `${name}\t${runtime.provider}\t${formatRuntimeTools(
    runtime.tools,
  )}${source}${warning}`;
}

export function renderCommandResult(
  result: CommandResult,
  options: RenderCommandResultOptions,
): void {
  if (options.jsonl) {
    if (result.kind === "services.action") {
      renderer.machine.json({
        type: "command.completed",
        status: result.report.status,
        action: result.action,
        report: result.report,
      });

      return;
    }

    renderer.machine.json(toJsonPayload(result));
    return;
  }

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
    case "profiles.current":
      renderer.log.report(result.profile ?? "default");
      return;
    case "profiles.selected":
      renderer.log.info(`Selected profile: ${result.profile}`);
      return;
    case "profiles.reset":
      renderer.log.info(`Reset profile to: ${result.profile}`);
      return;
    case "env.service":
      renderer.machine.envMap(result.resolvedEnv);
      return;
    case "runtime":
      renderer.log.report(
        [
          formatRuntimeLine("project", result.project),
          ...result.services.map((service) =>
            formatRuntimeLine(service.name, service),
          ),
        ].join("\n"),
      );

      return;
    case "stack.id":
      renderer.log.report(result.stackId);
      return;
    case "stack.current":
      renderer.log.report(`${result.stack.profile}\t${result.stack.stackId}`);
      return;
    case "stack.list":
      if (result.stacks.length === 0) {
        renderer.log.info("No stacks initialized.");
        return;
      }

      for (const stack of result.stacks) {
        const marker = stack.current ? "*" : " ";
        renderer.log.report(`${marker} ${stack.profile}\t${stack.stackId}`);
      }

      return;
    case "config":
      renderer.machine.json(result.filteredConfig, result.pretty);
      return;
    case "validate":
      renderer.machine.line(result.valid ? "valid" : "invalid");
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
    case "global.list":
      if (result.projects.length === 0 && result.orphans.length === 0) {
        renderer.log.info(renderer.command.noProjectsFoundText());
        return;
      }

      if (result.projects.length > 0) {
        renderer.log.report(
          renderer.command.globalListText(result.projects, result.allProjects),
        );
      }

      if (result.orphans.length > 0) {
        renderer.log.report(renderer.command.globalOrphansText(result.orphans));
      }

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

    case "global.prune":
      renderer.log.report(
        renderer.command.globalPruneCompletedText({
          status: result.status,
          staleProjects: result.staleProjects,
          removedProjects: result.removedProjects,
          resources: result.resources,
        }),
      );

      return;
    case "system.projects":
      renderer.log.report(renderer.system.projectsToText(result.projects));
      return;
    case "system.registry.prune":
      renderer.log.report(renderer.system.registryPrunedText(result.removed));
      return;
    case "system.registry.forget":
      renderer.log.report(renderer.system.registryForgotText(result.removed));
      return;
    case "system.registry.repair":
      renderer.log.report(
        renderer.system.registryRepairedText({
          removed: result.removed,
          projects: result.projects,
        }),
      );

      return;
    case "system.resources.audit":
      renderer.log.report(
        renderer.system.resourcesToText(result.audit.resources),
      );

      return;
    case "system.resources.cleanup":
      renderer.log.report(
        renderer.system.resourcesCleanedText({
          status: result.status,
          resources: result.cleanup.resources,
        }),
      );

      return;
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
    case "instance.label":
      if (result.updated) {
        renderer.log.info(
          renderer.command.instanceLabeledText({
            instanceKey: result.instanceKey,
            instanceId: result.instanceId,
            label: result.displayLabel,
          }),
        );
      } else {
        renderer.log.report(result.displayLabel);
      }

      return;
    case "volume.reset":
      renderer.log.info(
        `Reset ${Object.keys(result.volumes).length} managed volume assignment(s) for instance "${result.instanceKey}".`,
      );

      return;
    case "volume.prune":
      if (result.status === "aborted") {
        renderer.log.info(renderer.command.abortedText());
        return;
      }

      renderer.log.info(
        `Pruned ${Object.keys(result.volumes).length} stale managed volume(s) for instance "${result.instanceKey}".`,
      );

      return;
    case "volume.list":
      if (result.volumes.length === 0) {
        renderer.log.info(
          `No Docker volumes configured for service "${result.service}".`,
        );

        return;
      }

      for (const volume of result.volumes) {
        if (result.idOnly) {
          renderer.log.report(volume.name);
          continue;
        }

        const mode = volume.mode ? `:${volume.mode}` : "";
        const kind = volume.managed ? "managed" : "named";
        renderer.log.report(
          `${volume.name}:${volume.internalDir}${mode} (${kind})`,
        );
      }

      return;
    case "services.action":
      if (result.report.opened?.status === "success") {
        renderer.log.info(
          renderer.command.openingText(result.report.opened.url),
        );
      } else if (result.report.opened?.status === "skipped") {
        renderer.log.warn(result.report.opened.reason);
      }

      return;
    case "clone.completed":
    case "git.checkout.completed":
    case "git.pull.completed":
    case "git.status.completed":
    case "git.stash.completed":
      return;
  }
}
