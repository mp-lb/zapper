import {
  CommandHandler,
  CommandContext,
  CommandTarget,
} from "./CommandHandler";
import { StateManager } from "../core/StateManager";
import { CommandResult } from "./CommandResult";

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

      await stateManager.setSelectedProfile(profileName);
      return {
        kind: "profiles.selected",
        profile: profileName,
      };
    }

    if (action === "reset") {
      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        options.config,
      );

      await stateManager.clearSelectedProfile();
      return {
        kind: "profiles.reset",
        profile: "default",
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
}
