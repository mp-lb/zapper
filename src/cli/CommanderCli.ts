import { Command } from "commander";
import { Command as ZapCommand } from "../types/index";
import { Zapper } from "../core/Zapper";
import { logger, LogLevel } from "../utils/logger";
import { renderCommandResult } from "../ui/commandResultRenderer";
import {
  UpCommand,
  DownCommand,
  KillCommand,
  RestartCommand,
  StatusCommand,
  LogsCommand,
  ResetCommand,
  CloneCommand,
  TaskCommand,
  ProfilesCommand,
  StateCommand,
  CheckoutCommand,
  PullCommand,
  GitStatusCommand,
  GitStashCommand,
  ConfigCommand,
  EnvCommand,
  LaunchCommand,
  IsolateCommand,
  IsolateInfoCommand,
  GlobalCommand,
  CommandContext,
  CommandHandler,
  TaskParams,
} from "../commands";
import packageJson from "../../package.json";

function parseTaskArgs(rawArgv: string[], taskName: string): TaskParams {
  const named: Record<string, string> = {};
  const rest: string[] = [];

  // Find the position of the task command and task name in raw argv
  const taskIdx = rawArgv.findIndex((arg) =>
    ["task", "t", "run"].includes(arg),
  );
  if (taskIdx === -1) return { named, rest };

  // Get everything after the task name
  const taskNameIdx = rawArgv.indexOf(taskName, taskIdx);
  if (taskNameIdx === -1) return { named, rest };

  const argsAfterTask = rawArgv.slice(taskNameIdx + 1);

  // Find the -- separator in raw args
  const separatorIdx = argsAfterTask.indexOf("--");
  const namedArgs =
    separatorIdx >= 0 ? argsAfterTask.slice(0, separatorIdx) : argsAfterTask;
  const restArgs =
    separatorIdx >= 0 ? argsAfterTask.slice(separatorIdx + 1) : [];

  // Parse named args
  for (const arg of namedArgs) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const value = arg.slice(eqIdx + 1);
        named[key] = value;
      } else {
        const key = arg.slice(2);
        named[key] = "true";
      }
    }
  }

  rest.push(...restArgs);
  return { named, rest };
}

export class CommanderCli {
  private program: Command;
  private commandHandlers: Map<ZapCommand, CommandHandler> = new Map();

  constructor() {
    this.program = new Command();
    this.setupCommandHandlers();
    this.setupProgram();
  }

  private setupCommandHandlers(): void {
    this.commandHandlers.set("up", new UpCommand());
    this.commandHandlers.set("down", new DownCommand());
    this.commandHandlers.set("kill", new KillCommand());
    this.commandHandlers.set("restart", new RestartCommand());
    this.commandHandlers.set("status", new StatusCommand());
    this.commandHandlers.set("logs", new LogsCommand());
    this.commandHandlers.set("reset", new ResetCommand());
    this.commandHandlers.set("clone", new CloneCommand());
    this.commandHandlers.set("task", new TaskCommand());
    this.commandHandlers.set("profile", new ProfilesCommand());
    this.commandHandlers.set("environment", new EnvCommand());
    this.commandHandlers.set("state", new StateCommand());
    this.commandHandlers.set("git:checkout", new CheckoutCommand());
    this.commandHandlers.set("git:pull", new PullCommand());
    this.commandHandlers.set("git:status", new GitStatusCommand());
    this.commandHandlers.set("git:stash", new GitStashCommand());
    this.commandHandlers.set("config", new ConfigCommand());
    this.commandHandlers.set("env", new EnvCommand());
    this.commandHandlers.set("launch", new LaunchCommand());
    this.commandHandlers.set("isolate", new IsolateCommand());
    this.commandHandlers.set("isolate:info", new IsolateInfoCommand());
    this.commandHandlers.set("global", new GlobalCommand());
  }

  private setupProgram(): void {
    this.program
      .name("zap")
      .description("Lightweight dev environment runner")
      .version(packageJson.version);

    this.program
      .option("--config <file>", "Use a specific config file")
      .option("-v, --verbose", "Increase logging verbosity")
      .option("-q, --quiet", "Reduce logging output")
      .option("-d, --debug", "Enable debug logging");

    this.program
      .command("up")
      .alias("start")
      .alias("s")
      .alias("u")
      .description("Start all processes or specific processes")
      .argument("[services...]", "Services to start (space-separated)")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (services, options, command) => {
        await this.executeCommand("up", services, command);
      });

    this.program
      .command("down")
      .alias("stop")
      .alias("delete")
      .description("Stop all processes or specific processes")
      .argument("[services...]", "Services to stop (space-separated)")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (services, options, command) => {
        await this.executeCommand("down", services, command);
      });

    this.program
      .command("kill")
      .description(
        "Kill all PM2 processes and Docker containers across all instances for a project",
      )
      .argument(
        "[project]",
        "Project name to kill across all instances (defaults to current config project)",
      )
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, options, command) => {
        await this.executeCommand("kill", project, command);
      });

    this.program
      .command("restart")
      .alias("r")
      .description("Restart all processes or specific processes")
      .argument("[services...]", "Services to restart (space-separated)")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (services, options, command) => {
        await this.executeCommand("restart", services, command);
      });

    this.program
      .command("status")
      .alias("ps")
      .description(
        "Show status (PM2 + Docker), optionally for specific services",
      )
      .argument("[services...]", "Services to show status for")
      .option("-a, --all", "Include processes from all projects")
      .option("-j, --json", "Output status as minified JSON")
      .action(async (services, options, command) => {
        await this.executeCommand("status", services, command);
      });

    this.program
      .command("logs")
      .alias("l")
      .description("Show logs for one or more services")
      .argument("<services...>", "Services to show logs for")
      .option("-f, --follow", "Follow logs (default)", true)
      .option("--no-follow", "Do not follow logs (print and exit)")
      .action(async (services, options, command) => {
        await this.executeCommand("logs", services, command);
      });

    this.program
      .command("reset")
      .description("Stop all processes and delete the .zap directory")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (options, command) => {
        await this.executeCommand("reset", undefined, command);
      });

    this.program
      .command("clone")
      .description(
        "Clone all repos defined in native services (respects git_method)",
      )
      .argument("[services...]", "Services to clone")
      .option(
        "--http",
        "Use HTTP for git cloning (overrides config git_method)",
      )
      .option("--ssh", "Use SSH for git cloning (overrides config git_method)")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (services, options, command) => {
        await this.executeCommand("clone", services, command);
      });

    this.program
      .command("task")
      .alias("t")
      .alias("run")
      .description(
        "Run a one-off task by name, or list all tasks if no task specified",
      )
      .argument("[task]", "Task name to run")
      .option("-j, --json", "Output task list as minified JSON")
      .option("--list-params", "List parameters for the specified task")
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async (task, options, command) => {
        await this.executeCommand("task", task, command);
      });

    this.program
      .command("profile")
      .alias("p")
      .description(
        "Manage profiles: show interactive picker, enable a profile, list all profiles, or disable active profile",
      )
      .argument("[profile]", "Profile name to enable")
      .option("--list", "List all available profiles")
      .option("--disable", "Disable the currently active profile")
      .option(
        "-j, --json",
        "Output profile list as minified JSON (use with --list)",
      )
      .action(async (profile, options, command) => {
        await this.executeCommand("profile", profile, command);
      });

    this.program
      .command("environment")
      .alias("envset")
      .description(
        "Manage environments: show picker, enable an environment, list all environments, or disable active environment",
      )
      .argument("[environment]", "Environment name to enable")
      .option("--list", "List all available environments")
      .option("--disable", "Disable the currently active environment")
      .option(
        "-j, --json",
        "Output environment list as minified JSON (use with --list)",
      )
      .option("--service <name>", "Show env vars for a service (env command)")
      .action(async (environment, options, command) => {
        await this.executeCommand("environment", environment, command);
      });

    this.program
      .command("state")
      .description("Show the current state JSON")
      .option("-j, --json", "Output state as minified JSON")
      .action(async (options, command) => {
        await this.executeCommand("state", undefined, command);
      });

    const gitCmd = this.program
      .command("git")
      .description("Git operations across all native repos");

    gitCmd
      .command("status")
      .alias("gst")
      .description("List branch and dirty/clean for all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (options, command) => {
        await this.executeCommand("git:status", undefined, command);
      });

    gitCmd
      .command("pull")
      .alias("ggpur")
      .description("Pull latest for all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (options, command) => {
        await this.executeCommand("git:pull", undefined, command);
      });

    gitCmd
      .command("checkout <branch>")
      .alias("gco")
      .description("Checkout a branch across all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (branch, options, command) => {
        await this.executeCommand("git:checkout", branch, command);
      });

    gitCmd
      .command("stash")
      .alias("gsta")
      .description("Stash any dirty changes across all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (options, command) => {
        await this.executeCommand("git:stash", undefined, command);
      });

    // Top-level aliases for convenience
    this.program
      .command("gst")
      .description("Alias for: git status")
      .action(async (options, command) => {
        await this.executeCommand("git:status", undefined, command);
      });

    this.program
      .command("ggpur")
      .description("Alias for: git pull")
      .action(async (options, command) => {
        await this.executeCommand("git:pull", undefined, command);
      });

    this.program
      .command("gsta")
      .description("Alias for: git stash")
      .action(async (options, command) => {
        await this.executeCommand("git:stash", undefined, command);
      });

    this.program
      .command("gco <branch>")
      .description("Alias for: git checkout")
      .action(async (branch, options, command) => {
        await this.executeCommand("git:checkout", branch, command);
      });

    this.program
      .command("config")
      .description("Show the processed config object as minified JSON")
      .option(
        "--show-envs",
        "Include environment variable configurations in output",
      )
      .option("--pretty", "Format JSON output with indentation")
      .action(async (options, command) => {
        await this.executeCommand("config", undefined, command);
      });

    this.program
      .command("env")
      .description(
        "Manage environments or show resolved environment variables for a service",
      )
      .argument(
        "[name]",
        "Environment to enable or service to show environment variables for",
      )
      .option("--list", "List all available environments")
      .option("--disable", "Disable the currently active environment")
      .option("--service <name>", "Show env vars for a service")
      .option("-j, --json", "Output as minified JSON")
      .action(async (service, options, command) => {
        await this.executeCommand("env", service, command);
      });

    this.program
      .command("launch")
      .alias("open")
      .alias("o")
      .description(
        "Open homepage by default, or open a configured link by name",
      )
      .argument("[name]", "Link name to open")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (service, options, command) => {
        await this.executeCommand("launch", service, command);
      });

    const isolateCmd = this.program
      .command("isolate")
      .description("Manage worktree isolation")
      .argument("[instanceId]", "Optional instance ID to use as-is (enables isolation)")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (instanceId, options, command) => {
        // If no subcommand, enable isolation (backward compatible)
        await this.executeCommand("isolate", instanceId, command);
      });

    isolateCmd
      .command("info")
      .description("Show isolation status summary")
      .option("-j, --json", "Output result as minified JSON")
      .action(async (options, command) => {
        await this.executeCommand("isolate:info", undefined, command);
      });

    this.program
      .command("global <subcommand> [project]")
      .alias("g")
      .description("Global operations across projects (info, list, kill)")
      .option("-a, --all", "Apply to all projects (overrides project argument)")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (subcommand, project, options, command) => {
        // Validate mutually exclusive options
        if (options.all && project) {
          throw new Error(`Cannot specify both a project name ('${project}') and --all flag. Use either 'zap global ${subcommand} ${project}' or 'zap global ${subcommand} --all'.`);
        }
        const service = project ? [subcommand, project] : [subcommand];
        await this.executeCommand("global", service, command);
      });

    // Additional shortcuts for common global operations
    this.program
      .command("ginfo [project]")
      .description("Show info for a project (shorthand for 'global info')")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, options, command) => {
        const service = project ? ["info", project] : ["info"];
        await this.executeCommand("global", service, command);
      });

    this.program
      .command("glist")
      .alias("gl")
      .description("List all projects (shorthand for 'global list --all')")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (options, command) => {
        const service = ["list"];
        const allOptions = { ...options, all: true };
        command.setOptionValue("all", true);
        await this.executeCommand("global", service, command);
      });

    this.program
      .command("gkill [project]")
      .description("Kill project resources (shorthand for 'global kill')")
      .option("-a, --all", "Kill all projects")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, options, command) => {
        const service = project ? ["kill", project] : ["kill"];
        await this.executeCommand("global", service, command);
      });
  }

  private async executeCommand(
    command: ZapCommand,
    service: string | string[] | undefined,
    commandInstance: Command,
  ): Promise<void> {
    const parent = commandInstance.parent!;
    const globalOpts = parent.opts();
    const commandOpts = commandInstance.opts();
    const allOptions = { ...globalOpts, ...commandOpts };

    if (allOptions.debug) {
      logger.setLevel(LogLevel.DEBUG);
    } else if (allOptions.verbose) {
      logger.setLevel(LogLevel.INFO);
    } else if (allOptions.quiet) {
      logger.setLevel(LogLevel.WARN);
    }

    // Keep JSON output parseable on stdout by suppressing info/debug line logs.
    if (allOptions.json) {
      logger.setLevel(LogLevel.WARN);
    }

    const skipConfigLoad =
      (command === "kill" &&
        typeof service === "string" &&
        service.trim().length > 0) ||
      command === "global" ||
      command === "isolate:info";

    const zapper = new Zapper();
    if (!skipConfigLoad) {
      await zapper.loadConfig(allOptions.config, allOptions, {
        suppressUnisolatedWorktreeWarning:
          command === "isolate" || command === "isolate:info",
      });
    }

    const shouldResolveAliases =
      command !== "env" &&
      command !== "environment" &&
      command !== "isolate" &&
      command !== "isolate:info" &&
      command !== "launch" &&
      command !== "kill" &&
      command !== "profile";
    const resolvedService =
      service && shouldResolveAliases
        ? Array.isArray(service)
          ? service.map((s: string) => zapper.resolveServiceName(s))
          : zapper.resolveServiceName(service)
        : service;
    const normalizedService =
      Array.isArray(resolvedService) && resolvedService.length === 0
        ? undefined
        : resolvedService;

    const handler = this.commandHandlers.get(command);
    if (!handler) {
      throw new Error(`No handler found for command: ${command}`);
    }

    // Parse task parameters for the task command
    let taskParams: TaskParams | undefined;
    if (command === "task" && typeof normalizedService === "string") {
      taskParams = parseTaskArgs(process.argv, normalizedService);
    }

    const context: CommandContext = {
      zapper,
      service: normalizedService,
      options: allOptions,
      taskParams,
    };

    const result = await handler.execute(context);
    if (result) {
      renderCommandResult(result, {
        json: !!allOptions.json,
      });
    }
  }

  async parse(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }

  getHelp(): string {
    return this.program.helpInformation();
  }
}
