import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { emptyServiceActionReport } from "../utils/serviceActionReport";
import {
  serviceActionEventReporter,
  serviceActionJsonlReporter,
} from "../ui/serviceActionEventRenderer";

export class RestartCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service, options } = context;

    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    const reporter = options.jsonl
      ? serviceActionJsonlReporter
      : serviceActionEventReporter;

    const report =
      (services
        ? await zapper.restartProcesses(services, reporter)
        : await zapper.restartProcesses(undefined, reporter)) ??
      emptyServiceActionReport("restart", services);

    return {
      kind: "services.action",
      action: "restart",
      services,
      report,
    };
  }
}
