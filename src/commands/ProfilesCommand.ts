import { CommandHandler, CommandContext } from "./CommandHandler";
import { StateManager } from "../core/StateManager";
import { Process, Container } from "../types/Context";
import { CommandResult } from "./CommandResult";

export class ProfilesCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper, service, options } = context;
    if (Array.isArray(service)) {
      throw new Error("Profile command accepts a single profile name");
    }

    const zapperContext = zapper.getContext();
    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    // Handle --disable flag
    if (options.disable) {
      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        options.config,
      );
      return await this.disableProfile(
        stateManager,
        zapperContext.state.activeProfile,
      );
    }

    // Handle --list flag
    if (options.list) {
      return {
        kind: "profiles.list",
        profiles: zapperContext.profiles,
      };
    }

    // Handle specific profile selection
    if (service) {
      if (!zapperContext.profiles.includes(service)) {
        throw new Error(
          `Profile not found: ${service}. Available profiles: ${zapperContext.profiles.join(", ")}`,
        );
      }

      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        options.config,
      );
      return await this.enableProfile(stateManager, service);
    }

    // Handle interactive picker
    return {
      kind: "profiles.picker",
      profiles: zapperContext.profiles,
      activeProfile: zapperContext.state.activeProfile,
    };
  }

  private async enableProfile(
    stateManager: StateManager,
    profileName: string,
  ): Promise<CommandResult> {
    // Update the active profile state (this also reloads config)
    await stateManager.setActiveProfile(profileName);

    // Get all services that have this profile from the updated context
    const zapperContext = stateManager.getZapper().getContext();
    if (!zapperContext) {
      throw new Error("Context not loaded");
    }
    const servicesToStart: string[] = [];

    // Check processes
    zapperContext.processes.forEach((process: Process) => {
      if (
        Array.isArray(process.profiles) &&
        process.profiles.includes(profileName)
      ) {
        servicesToStart.push(process.name);
      }
    });

    // Check containers
    zapperContext.containers.forEach((container: Container) => {
      if (
        Array.isArray(container.profiles) &&
        container.profiles.includes(profileName)
      ) {
        servicesToStart.push(container.name);
      }
    });

    if (servicesToStart.length > 0) {
      await stateManager.getZapper().startProcesses(servicesToStart);
    }
    return {
      kind: "profiles.enabled",
      profile: profileName,
      startedServices: servicesToStart,
    };
  }

  private async disableProfile(
    stateManager: StateManager,
    currentActiveProfile?: string,
  ): Promise<CommandResult> {
    if (!currentActiveProfile) {
      return {
        kind: "profiles.disabled",
      };
    }

    // Clear the active profile state (this also reloads config)
    await stateManager.clearActiveProfile();

    // Run startAll to bring system to good state (stop services that were only running due to the disabled profile)
    await stateManager.getZapper().startProcesses(); // This will call startAll with no active profile
    return {
      kind: "profiles.disabled",
      activeProfile: currentActiveProfile,
    };
  }
}
