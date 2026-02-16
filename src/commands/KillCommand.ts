import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { confirm } from "../utils/confirm";

export class KillCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options } = context;
    const targets = await zapper.getProjectKillTargets();

    const proceed = await confirm(
      `This will permanently delete all PM2 processes and Docker containers with prefix "${targets.prefix}.". Found ${targets.pm2.length} PM2 process(es) and ${targets.containers.length} container(s). Continue?`,
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
