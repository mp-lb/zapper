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
import { confirm } from "../utils/confirm";
import { emptyServiceExecutionReport } from "../utils/serviceActionReport";

interface ProfileSnapshot {
  name: string;
  isolate: boolean;
  services: string[];
}

export class ProfilesCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper, service, options } = context;
    const zapperContext = zapper.getContext();

    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    const args = this.normalizeArgs(service);
    const action = args[0] ?? "current";

    if (!zapperContext.profile && zapperContext.profiles.length === 0) {
      throw new Error("No stack profiles configured");
    }

    if (action === "list") {
      return {
        kind: "profiles.list",
        profiles: zapperContext.profiles,
      };
    }

    if (action === "current") {
      return {
        kind: "profiles.current",
        profile: zapperContext.profile?.name,
        selectedProfile: zapperContext.state.selectedProfile,
        overrideProfile:
          typeof options.profile === "string" ? options.profile : undefined,
      };
    }

    if (action === "use") {
      const profileName = args[1];

      if (!profileName) {
        throw new Error("Usage: zap profile use <name>");
      }

      if (!zapperContext.profiles.includes(profileName)) {
        throw new Error(
          this.notFoundMessage(profileName, zapperContext.profiles),
        );
      }

      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        options.config,
      );

      const before = this.snapshot(zapperContext);
      await stateManager.setSelectedProfile(profileName);
      const hotSwap = await this.hotSwap(context, before);

      return {
        kind: "profiles.selected",
        profile: profileName,
        previousProfile: before?.name,
        hotSwap,
      };
    }

    if (action === "reset") {
      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        options.config,
      );

      const before = this.snapshot(zapperContext);
      await stateManager.clearSelectedProfile();
      const hotSwap = await this.hotSwap(context, before);

      return {
        kind: "profiles.reset",
        profile: "default",
        previousProfile: before?.name,
        hotSwap,
      };
    }

    throw new Error(
      `Unknown profile command: ${action}. Use: zap profile list|current|use|reset`,
    );
  }

  private normalizeArgs(service: CommandTarget | undefined): string[] {
    if (!service) return [];
    return Array.isArray(service) ? service : [service];
  }

  private notFoundMessage(profile: string, profiles: string[]): string {
    return `Profile not found: ${profile}. Available profiles: ${profiles.join(", ")}`;
  }

  private snapshot(
    context: ReturnType<CommandContext["zapper"]["getContext"]>,
  ): ProfileSnapshot | undefined {
    if (!context?.profile) return undefined;

    return {
      name: context.profile.name,
      isolate: context.profile.isolate,
      services: this.serviceNames(context),
    };
  }

  private serviceNames(
    context: NonNullable<ReturnType<CommandContext["zapper"]["getContext"]>>,
  ): string[] {
    return [
      ...context.processes.map((process) => process.name),
      ...context.containers.map((container) => container.name),
    ].sort();
  }

  private async hotSwap(
    context: CommandContext,
    before: ProfileSnapshot | undefined,
  ): Promise<ProfileHotSwapReport | undefined> {
    const { zapper, options } = context;
    const afterContext = zapper.getContext();

    if (!before || !afterContext?.profile) return undefined;

    const after: ProfileSnapshot = {
      name: afterContext.profile.name,
      isolate: afterContext.profile.isolate,
      services: this.serviceNames(afterContext),
    };

    if (before.name === after.name) return undefined;
    if (before.isolate || after.isolate) return undefined;

    const afterServices = new Set(after.services);

    const cleanupCandidates = before.services.filter(
      (service) => !afterServices.has(service),
    );

    const reporter = options.jsonl
      ? serviceActionJsonlReporter
      : serviceActionEventReporter;

    const started =
      after.services.length > 0
        ? await zapper.startProcesses(after.services, reporter)
        : { ...emptyServiceExecutionReport() };

    let stopped = undefined;
    let cleanupSkipped = cleanupCandidates;

    if (cleanupCandidates.length > 0) {
      const canPrompt = !options.json && !options.jsonl;

      const shouldStop =
        Boolean(options.force) ||
        (canPrompt &&
          (await confirm(
            `Shut down services no longer needed by ${after.name}: ${cleanupCandidates.join(", ")}?`,
            { defaultYes: true },
          )));

      if (shouldStop) {
        stopped = await zapper.stopProfileProcesses(
          before.name,
          cleanupCandidates,
          reporter,
        );

        cleanupSkipped = [];
      }
    }

    return {
      started,
      stopped,
      cleanupCandidates,
      cleanupSkipped,
    };
  }
}
