import { Zapper } from "./Zapper";
import { saveState } from "../config/stateLoader";
import { ZapperState } from "../config/schemas";
import { renderer } from "../ui/renderer";

/**
 * Centralized state management that handles both state persistence
 * and config reloading to ensure in-memory state stays synchronized.
 */
export class StateManager {
  private zapper: Zapper;
  private projectRoot: string;
  private configPath?: string;

  constructor(zapper: Zapper, projectRoot: string, configPath?: string) {
    this.zapper = zapper;
    this.projectRoot = projectRoot;
    this.configPath = configPath;
  }

  /**
   * Updates state and reloads the entire config to ensure synchronization.
   * This all-or-nothing approach is easier to reason about and less error-prone.
   */
  private async updateStateAndReload(
    stateUpdate: Partial<ZapperState>,
  ): Promise<void> {
    // Save state to file
    saveState(this.projectRoot, stateUpdate);

    // Reload entire config to pick up the updated state
    await this.zapper.loadConfig(this.configPath);

    renderer.log.debug("State updated and config reloaded");
  }

  /**
   * Set the selected stack profile and reload config.
   */
  async setSelectedProfile(profileName: string): Promise<void> {
    await this.updateStateAndReload({ selectedProfile: profileName });
  }

  /**
   * Clear the selected stack profile and reload config.
   */
  async clearSelectedProfile(): Promise<void> {
    await this.updateStateAndReload({ selectedProfile: undefined });
  }

  /**
   * Update multiple state properties at once and reload config.
   */
  async updateState(stateUpdate: Partial<ZapperState>): Promise<void> {
    await this.updateStateAndReload(stateUpdate);
  }

  /**
   * Get the current state from the in-memory config.
   * This is always up-to-date after any state update operations.
   */
  getCurrentState(): ZapperState {
    const context = this.zapper.getContext();

    if (!context) {
      throw new Error("Context not loaded");
    }

    return context.state;
  }

  /**
   * Get the zapper instance for operations that need direct access.
   */
  getZapper(): Zapper {
    return this.zapper;
  }
}
