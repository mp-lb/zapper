import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class CheckoutCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    if (Array.isArray(service)) {
      throw new Error("Branch name required: provide a single branch name");
    }

    if (!service) {
      throw new Error("Branch name required: zap checkout --service <branch>");
    }

    await zapper.gitCheckoutAll(service);
    return {
      kind: "git.checkout.completed",
      branch: service,
    };
  }
}
