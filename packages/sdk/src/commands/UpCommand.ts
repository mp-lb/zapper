import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { openUrl } from "./LaunchCommand";
import { emptyServiceActionReport } from "../utils/serviceActionReport";
import {
  serviceActionEventReporter,
  serviceActionJsonlReporter,
} from "../ui/serviceActionEventRenderer";

export class UpCommand extends CommandHandler {
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
        ? await zapper.startProcesses(services, reporter)
        : await zapper.startProcesses(undefined, reporter)) ??
      emptyServiceActionReport("up", services);

    if (options.open) {
      const zapperContext = zapper.getContext();

      if (zapperContext?.homepage) {
        openUrl(zapperContext.homepage);
        report.opened = {
          status: "success",
          url: zapperContext.homepage,
        };
      } else {
        report.opened = {
          status: "skipped",
          reason: "No homepage configured. Set `homepage` in zap.yaml.",
        };
      }
    }

    return {
      kind: "services.action",
      action: "up",
      services,
      report,
    };
  }
}
