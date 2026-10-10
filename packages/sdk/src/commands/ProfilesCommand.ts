import {
  CommandHandler,
  CommandContext,
  CommandTarget,
} from "./CommandHandler";
import { StateManager } from "../core/StateManager";
import { CommandResult, ProfileHotSwapReport } from "./CommandResult";
import {
  serviceActionEventReporter,
  serviceActionJsonlReporter,
} from "../ui/serviceActionEventRenderer";
import { select } from "../utils/select";
import { isDeepStrictEqual } from "node:util";
import type { Context } from "../types/Context";
import { emptyServiceExecutionReport } from "../utils/serviceActionReport";

export class ProfilesCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper, service, options } = context;
    const zapperContext = zapper.getContext();

    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    const args = this.normalizeArgs(service);
    let action = args[0] ?? "current";

    if (!zapperContext.profile && zapperContext.profiles.length === 0) {
      throw new Error("No stack profiles configured");
    }

    if (action === "list") {
      return {
        kind: "profiles.list",
        profiles: zapperContext.profiles,
      };
    }

    if (action === "select") {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error(
          "Interactive profile selection requires a terminal. Use zap profile get or zap profile set <name>.",
        );
      }

      const current = zapperContext.profile?.name;

      const name = await select(
        "Select profile",
        zapperContext.profiles.map((name) => ({
          label: name === current ? `${name} ✓ active` : name,
          value: name,
        })),
        {
          initial: Math.max(0, zapperContext.profiles.indexOf(current ?? "")),
          hint: "Use ↑/↓ to move, Enter to switch, Esc to cancel",
        },
      );

      args[1] = name;
      action = "set";
    }

    if (action === "current" || action === "get") {
      return {
        kind: "profiles.current",
        profile: zapperContext.profile?.name,
        selectedProfile: zapperContext.state.selectedProfile,
        overrideProfile:
          typeof options.profile === "string" ? options.profile : undefined,
      };
    }

    if (action === "use" || action === "set" || action === "reset") {
      const profileName = action === "reset" ? "default" : args[1];
      if (!profileName) throw new Error("Usage: zap profile set <name>");

      if (!zapperContext.profiles.includes(profileName)) {
        throw new Error(
          this.notFoundMessage(profileName, zapperContext.profiles),
        );
      }

      const configPath = options.config ?? zapperContext.configPath;

      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        configPath,
      );

      // Resolve the target without saving it. A failed transition keeps the
      // previous selection, so retrying can still clean up the old profile.
      await zapper.loadConfig(configPath, {
        profile: profileName,
        __command: "profile",
      });

      const hotSwap = await this.hotSwap(context, zapperContext);

      if (action === "reset") {
        await stateManager.clearSelectedProfile();
      } else {
        await stateManager.setSelectedProfile(profileName);
      }

      return {
        kind: action === "reset" ? "profiles.reset" : "profiles.selected",
        profile: profileName,
        previousProfile: zapperContext.profile?.name,
        hotSwap,
      };
    }

    throw new Error(
      `Unknown profile command: ${action}. Use: zap profile list|get|set|reset`,
    );
  }

  private normalizeArgs(service: CommandTarget | undefined): string[] {
    if (!service) return [];
    return Array.isArray(service) ? service : [service];
  }

  private notFoundMessage(profile: string, profiles: string[]): string {
    return `Profile not found: ${profile}. Available profiles: ${profiles.join(", ")}`;
  }

  private async hotSwap(
    context: CommandContext,
    before: Context,
  ): Promise<ProfileHotSwapReport | undefined> {
    const { zapper, options } = context;
    const after = zapper.getContext();
    if (!before.profile || !after?.profile) return undefined;

    const beforeServices = [...before.processes, ...before.containers];
    const afterServices = [...after.processes, ...after.containers];

    const differentStack =
      before.profile.name !== after.profile.name &&
      (before.profile.isolate || after.profile.isolate);

    // Contexts already contain each service's resolvedEnv. Compare those
    // effective values, not the env-file paths: a different file stack may
    // leave a service's environment unchanged (for example with a whitelist).
    const cleanupCandidates = beforeServices
      .filter((service) => {
        const next = afterServices.find(
          (candidate) => candidate.name === service.name,
        );

        return differentStack || !next || !isDeepStrictEqual(service, next);
      })
      .map((service) => service.name)
      .sort();

    // Decide the full transition before executing it. Shared services that
    // changed are stopped here and started once alongside new services;
    // the start planner leaves already-running, unchanged services alone.
    const services = afterServices.map((service) => service.name).sort();

    const reporter = options.jsonl
      ? serviceActionJsonlReporter
      : serviceActionEventReporter;

    const stopped =
      cleanupCandidates.length > 0
        ? await zapper.stopProfileProcesses(
            before.profile.name,
            cleanupCandidates,
            reporter,
          )
        : undefined;

    if (stopped?.failed.length) {
      throw new Error(
        `Profile switch to ${after.profile.name} failed while stopping services. Previous profile remains selected.`,
      );
    }

    const started =
      services.length > 0
        ? await zapper.startProcesses(services, reporter)
        : emptyServiceExecutionReport();

    if (started.failed.length) {
      throw new Error(
        `Profile switch to ${after.profile.name} failed while starting services. Previous profile remains selected.`,
      );
    }

    return { started, stopped, cleanupCandidates, cleanupSkipped: [] };
  }
}
