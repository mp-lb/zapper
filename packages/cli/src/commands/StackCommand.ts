import { CommandContext, CommandHandler } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export interface StackInfo {
  profile: string;
  stackId: string;
  current: boolean;
}

export class StackCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    const args = Array.isArray(service) ? service : service ? [service] : [];
    const action = args[0] ?? "current";

    const zapperContext = zapper.getContext();

    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    const currentProfile = zapperContext.profile?.name ?? "default";
    const currentStackId = zapperContext.instanceId ?? null;

    const stacks = this.getStacks(
      zapperContext.state.stacks,
      currentProfile,
      currentStackId,
    );

    if (action === "id") {
      if (!currentStackId) {
        throw new Error(
          "Current stack is not initialized. Run zap init first.",
        );
      }

      return {
        kind: "stack.id",
        stackId: currentStackId,
        profile: currentProfile,
      };
    }

    if (action === "current") {
      if (!currentStackId) {
        throw new Error(
          "Current stack is not initialized. Run zap init first.",
        );
      }

      return {
        kind: "stack.current",
        stack: {
          profile: currentProfile,
          stackId: currentStackId,
          current: true,
        },
      };
    }

    if (action === "list") {
      return {
        kind: "stack.list",
        stacks,
      };
    }

    throw new Error("Unknown stack command. Use: zap stack id|current|list");
  }

  private getStacks(
    stateStacks:
      | Record<string, { stackId: string; profile: string }>
      | undefined,
    currentProfile: string,
    currentStackId: string | null,
  ): StackInfo[] {
    const stacks = Object.entries(stateStacks ?? {}).map(
      ([profile, stack]) => ({
        profile,
        stackId: stack.stackId,
        current:
          stack.stackId === currentStackId ||
          (profile === currentProfile && stack.stackId === currentStackId),
      }),
    );

    if (
      currentStackId &&
      !stacks.some((stack) => stack.stackId === currentStackId)
    ) {
      stacks.push({
        profile: currentProfile,
        stackId: currentStackId,
        current: true,
      });
    }

    return stacks.sort((a, b) => a.profile.localeCompare(b.profile));
  }
}
