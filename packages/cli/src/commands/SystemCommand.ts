import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { confirm } from "../utils/confirm";
import {
  auditSystemResources,
  cleanupSystemResources,
  forgetSystemRegistryEntry,
  getSystemProjects,
  pruneSystemRegistry,
} from "../system";

function systemArgs(service: CommandContext["service"]): string[] {
  if (!service) return [];
  return Array.isArray(service) ? service : [service];
}

export class SystemCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const args = systemArgs(context.service);
    const [area, action, target] = args;

    if (!area || area === "projects") {
      return {
        kind: "system.projects",
        projects: await getSystemProjects(),
      };
    }

    if (area === "registry") {
      if (action === "prune") {
        return {
          kind: "system.registry.prune",
          removed: await pruneSystemRegistry(),
        };
      }

      if (action === "forget") {
        if (!target) {
          throw new Error(
            "Registry forget requires a registry id, project root, or config path",
          );
        }

        return {
          kind: "system.registry.forget",
          removed: await forgetSystemRegistryEntry(target),
        };
      }

      if (action === "repair") {
        const removed = await pruneSystemRegistry();
        return {
          kind: "system.registry.repair",
          removed,
          projects: await getSystemProjects(),
        };
      }

      throw new Error(
        "Unknown system registry action. Use prune, forget, or repair.",
      );
    }

    if (area === "resources") {
      if (!action || action === "audit") {
        return {
          kind: "system.resources.audit",
          audit: await auditSystemResources(),
        };
      }

      if (action === "cleanup") {
        const audit = await auditSystemResources();

        const resources = audit.resources.filter(
          (resource) =>
            context.options.includeVolumes || resource.type !== "volume",
        );

        if (resources.length === 0) {
          return {
            kind: "system.resources.cleanup",
            status: "completed",
            cleanup: { resources: [] },
          };
        }

        const proceed = await confirm(
          `Delete ${resources.length} orphaned system resource(s)?`,
          { defaultYes: false, force: context.options.force },
        );

        if (!proceed) {
          return {
            kind: "system.resources.cleanup",
            status: "aborted",
            cleanup: { resources },
          };
        }

        return {
          kind: "system.resources.cleanup",
          status: "completed",
          cleanup: await cleanupSystemResources({
            includeVolumes: context.options.includeVolumes,
          }),
        };
      }

      throw new Error("Unknown system resources action. Use audit or cleanup.");
    }

    throw new Error(
      "Unknown system command. Use projects, registry, or resources.",
    );
  }
}
