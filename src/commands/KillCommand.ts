import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { confirm } from "../utils/confirm";
import { renderer } from "../ui/renderer";

export class KillCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options, service } = context;
    if (Array.isArray(service)) {
      throw new Error("Kill command accepts a single project name");
    }
    const projectName =
      service && service.trim().length > 0 ? service : undefined;
    const targets = await zapper.getProjectKillTargets(projectName);

    renderer.log.report(
      renderer.command.globalListText(
        [
          {
            name: targets.projectName,
            pm2: targets.pm2,
            containers: targets.containers,
          },
        ],
        false,
      ),
    );
    renderer.log.info(
      renderer.confirm.killProjectPromptText({
        projectName: targets.projectName,
        prefix: targets.prefix,
        pm2Count: targets.pm2.length,
        containerCount: targets.containers.length,
      }),
    );

    const proceed = await confirm(
      renderer.confirm.deleteResourcesPromptText(),
      { defaultYes: false, force: options.force },
    );

    if (!proceed) {
      return {
        kind: "kill",
        status: "aborted",
        projectName: targets.projectName,
        prefix: targets.prefix,
        pm2: targets.pm2,
        containers: targets.containers,
      };
    }

    const killed = await zapper.killProjectResources(targets);
    return {
      kind: "kill",
      status: "completed",
      projectName: killed.projectName,
      prefix: killed.prefix,
      pm2: killed.pm2,
      containers: killed.containers,
    };
  }
}
