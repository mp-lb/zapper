import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { emptyServiceActionReport } from "../utils/serviceActionReport";
import {
  serviceActionEventReporter,
  serviceActionJsonlReporter,
} from "../ui/serviceActionEventRenderer";

export class DownCommand extends CommandHandler {
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
        ? await zapper.stopProcesses(services, reporter)
        : await zapper.stopProcesses(undefined, reporter)) ??
      emptyServiceActionReport("down", services);

    return {
      kind: "services.action",
      action: "down",
      services,
      report,
    };
  }
}
