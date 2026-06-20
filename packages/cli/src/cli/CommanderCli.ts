import { Command } from "commander";
import { createArcCommand } from "../arc/command";
import { captureCommandRun } from "../analytics";
import {
  type Command as ZapCommand,
  Zapper,
  logger,
  LogLevel,
  renderer,
  renderCommandResult,
  UpCommand,
  DownCommand,
  KillCommand,
  RestartCommand,
  WatchCommand,
  StatusCommand,
  ListCommand,
  LogsCommand,
  StartupLogCommand,
  ResetCommand,
  CloneCommand,
  TaskCommand,
  ProfilesCommand,
  StateCommand,
  StackCommand,
  CheckoutCommand,
  PullCommand,
  GitStatusCommand,
  GitStashCommand,
  ConfigCommand,
  ValidateCommand,
  EnvCommand,
  RuntimeCommand,
  LaunchCommand,
  OpenCommand,
  LinksCommand,
  HomeCommand,
  NotesCommand,
  InitCommand,
  InstanceCommand,
  VolumeCommand,
  GlobalCommand,
  SystemCommand,
  CommandContext,
  CommandHandler,
  TaskParams,
  VERSION,
} from "@mp-lb/zapper-sdk";

const STATUS_WATCH_IDLE_INTERVAL_MS = 10_000;
const STATUS_WATCH_ACTIVE_INTERVAL_MS = 1_000;
const STATUS_WATCH_ACTIVE_WINDOW_MS = 10_000;

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
  const reservedTaskOptions = new Set([
    "force",
    "interactive",
    "json",
    "list-params",
  ]);

  for (let index = 0; index < namedArgs.length; index += 1) {
    const arg = namedArgs[index];

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");

      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        if (reservedTaskOptions.has(key)) continue;
        const value = arg.slice(eqIdx + 1);
        named[key] = value;
      } else {
        const key = arg.slice(2);
        if (reservedTaskOptions.has(key)) continue;

        const nextArg = namedArgs[index + 1];

        if (nextArg !== undefined && !nextArg.startsWith("--")) {
          named[key] = nextArg;
          index += 1;
        } else {
          named[key] = "true";
        }
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
    this.commandHandlers.set("watch", new WatchCommand());
    this.commandHandlers.set("status", new StatusCommand());
    this.commandHandlers.set("ls", new ListCommand());
    this.commandHandlers.set("logs", new LogsCommand());
    this.commandHandlers.set("startup-log", new StartupLogCommand());
    this.commandHandlers.set("reset", new ResetCommand());
    this.commandHandlers.set("clone", new CloneCommand());
    this.commandHandlers.set("task", new TaskCommand());
    this.commandHandlers.set("profile", new ProfilesCommand());
    this.commandHandlers.set("state", new StateCommand());
    this.commandHandlers.set("stack", new StackCommand());
    this.commandHandlers.set("git:checkout", new CheckoutCommand());
    this.commandHandlers.set("git:pull", new PullCommand());
    this.commandHandlers.set("git:status", new GitStatusCommand());
    this.commandHandlers.set("git:stash", new GitStashCommand());
    this.commandHandlers.set("config", new ConfigCommand());
    this.commandHandlers.set("validate", new ValidateCommand());
    this.commandHandlers.set("env", new EnvCommand());
    this.commandHandlers.set("runtime", new RuntimeCommand());
    this.commandHandlers.set("launch", new LaunchCommand());
    this.commandHandlers.set("open", new OpenCommand());
    this.commandHandlers.set("links", new LinksCommand());
    this.commandHandlers.set("home", new HomeCommand());
    this.commandHandlers.set("notes", new NotesCommand());
    this.commandHandlers.set("init", new InitCommand());
    this.commandHandlers.set("instance", new InstanceCommand());
    this.commandHandlers.set("volume", new VolumeCommand());
    this.commandHandlers.set("global", new GlobalCommand());
    this.commandHandlers.set("system", new SystemCommand());
  }

  private setupProgram(): void {
    this.program
      .name("zap")
      .description("Lightweight dev environment runner")
      .version(VERSION);

    this.program
      .option("--config <file>", "Use a specific config file")
      .option("--profile <name>", "Use a profile for this invocation")
      .option("--instance <name>", "Target a named instance (default: default)")
      .option("-v, --verbose", "Increase logging verbosity")
      .option("-q, --quiet", "Reduce logging output")
      .option("-d, --debug", "Enable debug logging");

    // Zap Arc: self-contained deploy command group (no Zapper runtime
    // context; owns the reserved `deploy` zap.yaml key).
    this.program.addCommand(createArcCommand());

    this.program
      .command("up")
      .alias("start")
      .alias("s")
      .alias("u")
      .description("Start all processes or specific processes")
      .argument("[services...]", "Services to start (space-separated)")
      .option("-o, --open", "Open the configured homepage after starting")
      .option("-j, --json", "Output command result as minified JSON")
      .option("--jsonl", "Stream command events as JSON Lines")
      .action(async (services, _options, command) => {
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
      .option("--jsonl", "Stream command events as JSON Lines")
      .action(async (services, _options, command) => {
        await this.executeCommand("down", services, command);
      });

    this.program
      .command("kill")
      .description(
        "Kill all native processes and Docker containers across all instances for a project",
      )
      .argument(
        "[project]",
        "Project name to kill across all instances (defaults to current config project)",
      )
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, _options, command) => {
        await this.executeCommand("kill", project, command);
      });

    this.program
      .command("restart")
      .alias("r")
      .description("Restart all processes or specific processes")
      .argument("[services...]", "Services to restart (space-separated)")
      .option("-j, --json", "Output command result as minified JSON")
      .option("--jsonl", "Stream command events as JSON Lines")
      .action(async (services, _options, command) => {
        await this.executeCommand("restart", services, command);
      });

    this.program
      .command("watch")
      .alias("w")
      .description(
        "Watch Docker service paths and restart or rebuild on changes",
      )
      .argument("[services...]", "Services to watch")
      .action(async (services, _options, command) => {
        await this.executeCommand("watch", services, command);
      });

    this.program
      .command("status")
      .alias("ps")
      .description(
        "Show status (native processes + Docker), optionally for specific services",
      )
      .argument("[services...]", "Services to show status for")
      .option("-a, --all", "Include processes from all projects")
      .option("-j, --json", "Output status as minified JSON")
      .option("--watch", "Keep running and refresh status until stopped")
      .action(async (services, _options, command) => {
        await this.executeCommand("status", services, command);
      });

    this.program
      .command("ls")
      .description("List configured services with details and assigned ports")
      .argument("[services...]", "Services to list")
      .option("-e, --extended", "Show instance and dangling resource inventory")
      .option("-a, --all", "Alias for --extended")
      .option("-j, --json", "Output list as minified JSON")
      .action(async (services, _options, command) => {
        await this.executeCommand("ls", services, command);
      });

    this.program
      .command("logs")
      .alias("l")
      .description("Show logs for one or more services")
      .argument("<services...>", "Services to show logs for")
      .option("-f, --follow", "Follow logs")
      .option("--no-follow", "Do not follow logs (default)")
      .action(async (services, _options, command) => {
        await this.executeCommand("logs", services, command);
      });

    this.program
      .command("startup-log")
      .description("Show saved startup output for one or more services")
      .argument("<services...>", "Services to show startup logs for")
      .action(async (services, _options, command) => {
        await this.executeCommand("startup-log", services, command);
      });

    this.program
      .command("reset")
      .description("Stop all processes and delete the .zap directory")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("reset", undefined, command);
      });

    this.program
      .command("init")
      .description("Initialize local zap state (instance + ports + volumes)")
      .option(
        "-i, --instance [name]",
        "Create/select an instance for initialization (default: default)",
      )
      .option(
        "-R, --random",
        "Randomize all configured ports instead of preserving existing assignments",
      )
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("init", undefined, command);
      });

    const instanceCmd = this.program
      .command("instance")
      .description("Manage the selected local instance")
      .action(async (_options, command) => {
        await this.executeCommand("instance", undefined, command);
      });

    instanceCmd
      .command("label")
      .description("Show or set the label for the selected instance")
      .argument("[label...]", "New label (omit to show the current label)")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (labelParts, _options, command) => {
        await this.executeCommand(
          "instance",
          ["label", ...(labelParts || [])],
          command,
        );
      });

    const volumeCmd = this.program
      .command("volume")
      .description(
        "Manage Zapper-generated Docker volumes (list, prune, reset)",
      )
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        // No subcommand defaults to prune (matches VolumeCommand).
        await this.executeCommand("volume", undefined, command);
      });

    volumeCmd
      .command("list")
      .description("List Docker volumes for a service")
      .argument("<service>", "Docker service name")
      .option("--managed", "Only list Zapper-managed generated volumes")
      .option("--id-only", "Only print Docker volume names")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (service, _options, command) => {
        await this.executeCommand("volume", ["list", service], command);
      });

    volumeCmd
      .command("prune")
      .description("Remove stale managed Docker volumes after confirmation")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("volume", ["prune"], command);
      });

    volumeCmd
      .command("reset")
      .description("Reset managed Docker volume state for the instance")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("volume", ["reset"], command);
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
      .action(async (services, _options, command) => {
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
      .option("-f, --force", "Run task even when status checks pass")
      .option("--interactive", "Prompt for missing required task parameters")
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async (task, _options, command) => {
        await this.executeCommand("task", task, command);
      });

    this.program
      .command("runtime")
      .description("Show native runtime provider/tool resolution")
      .option("-j, --json", "Output runtime info as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("runtime", undefined, command);
      });

    const profileCmd = this.program
      .command("profile")
      .alias("p")
      .description("Manage profiles")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        // No subcommand defaults to showing the current profile.
        await this.executeCommand("profile", undefined, command);
      });

    profileCmd
      .command("list")
      .description("List configured profiles")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("profile", ["list"], command);
      });

    profileCmd
      .command("current")
      .description("Show the current profile")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("profile", ["current"], command);
      });

    profileCmd
      .command("use")
      .description("Switch the saved profile for this project")
      .argument("<name>", "Profile name to select")
      .option(
        "-y, --force",
        "Shut down services no longer needed without prompting",
      )
      .option("-j, --json", "Output as minified JSON")
      .action(async (name, _options, command) => {
        await this.executeCommand("profile", ["use", name], command);
      });

    profileCmd
      .command("reset")
      .description("Reset to the default profile")
      .option(
        "-y, --force",
        "Shut down services no longer needed without prompting",
      )
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("profile", ["reset"], command);
      });

    this.program
      .command("state")
      .description("Show the current state JSON")
      .option("-j, --json", "Output state as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("state", undefined, command);
      });

    const stackCmd = this.program
      .command("stack")
      .description("Inspect the selected stack id and known profile stacks")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        // No subcommand defaults to showing the current stack.
        await this.executeCommand("stack", undefined, command);
      });

    stackCmd
      .command("id")
      .description("Print the current stack id")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("stack", ["id"], command);
      });

    stackCmd
      .command("current")
      .description("Show the current stack")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("stack", ["current"], command);
      });

    stackCmd
      .command("list")
      .description("List known profile stacks")
      .option("-j, --json", "Output as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("stack", ["list"], command);
      });

    const gitCmd = this.program
      .command("git")
      .description("Git operations across all native repos");

    gitCmd
      .command("status")
      .alias("gst")
      .description("List branch and dirty/clean for all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("git:status", undefined, command);
      });

    gitCmd
      .command("pull")
      .alias("ggpur")
      .description("Pull latest for all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("git:pull", undefined, command);
      });

    gitCmd
      .command("checkout <branch>")
      .alias("gco")
      .description("Checkout a branch across all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (branch, _options, command) => {
        await this.executeCommand("git:checkout", branch, command);
      });

    gitCmd
      .command("stash")
      .alias("gsta")
      .description("Stash any dirty changes across all native repos")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("git:stash", undefined, command);
      });

    // Top-level aliases for convenience
    this.program
      .command("gst")
      .description("Alias for: git status")
      .action(async (_options, command) => {
        await this.executeCommand("git:status", undefined, command);
      });

    this.program
      .command("ggpur")
      .description("Alias for: git pull")
      .action(async (_options, command) => {
        await this.executeCommand("git:pull", undefined, command);
      });

    this.program
      .command("gsta")
      .description("Alias for: git stash")
      .action(async (_options, command) => {
        await this.executeCommand("git:stash", undefined, command);
      });

    this.program
      .command("gco <branch>")
      .description("Alias for: git checkout")
      .action(async (branch, _options, command) => {
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
      .action(async (_options, command) => {
        await this.executeCommand("config", undefined, command);
      });

    this.program
      .command("validate")
      .description("Validate zap.yaml without initializing local state")
      .option(
        "-j, --json",
        "Output validation result and full Zod issues as JSON",
      )
      .action(async (_options, command) => {
        await this.executeCommand("validate", undefined, command);
      });

    this.program
      .command("env")
      .description("Show resolved environment variables for a service")
      .argument("[service]", "Service to show environment variables for")
      .option("--service <name>", "Show env vars for a service")
      .option("-j, --json", "Output as minified JSON")
      .action(async (service, _options, command) => {
        await this.executeCommand("env", service, command);
      });

    this.program
      .command("launch")
      .description(
        "Open homepage by default, or open a configured link by name",
      )
      .argument("[name]", "Link name to open")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (service, _options, command) => {
        await this.executeCommand("launch", service, command);
      });

    this.program
      .command("open")
      .alias("o")
      .description("Choose a configured project link interactively")
      .argument("[name]", "Link name to open without prompting")
      .option("--home", "Open the configured homepage without prompting")
      .option(
        "--non-interactive",
        "Open the configured homepage or named link without prompting",
      )
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (service, _options, command) => {
        await this.executeCommand("open", service, command);
      });

    this.program
      .command("home")
      .description("Print the configured homepage URL")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("home", undefined, command);
      });

    this.program
      .command("links")
      .description("List configured links, including the homepage")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("links", undefined, command);
      });

    this.program
      .command("notes")
      .description("Print configured project notes")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("notes", undefined, command);
      });

    const globalCmd = this.program
      .command("global")
      .alias("g")
      .description(
        "Global operations across projects (info, list, prune, kill)",
      )
      .action(async (_options, command) => {
        // No subcommand routes through the handler, which reports usage.
        await this.executeCommand("global", undefined, command);
      });

    globalCmd
      .command("list")
      .alias("ls")
      .alias("l")
      .description("List all global Zapper resources, or a single project")
      .argument("[project]", "Project name to inspect")
      .option("-a, --all", "Legacy no-op; always lists all projects")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, _options, command) => {
        await this.executeCommand(
          "global",
          project ? ["list", project] : ["list"],
          command,
        );
      });

    globalCmd
      .command("info")
      .description("Show global resources for a project")
      .argument("[project]", "Project name to inspect")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, _options, command) => {
        await this.executeCommand(
          "global",
          project ? ["info", project] : ["info"],
          command,
        );
      });

    globalCmd
      .command("prune")
      .description("Prune stale registry entries and orphaned resources")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("global", ["prune"], command);
      });

    globalCmd
      .command("kill")
      .description("Kill all native process + Docker resources for a project")
      .argument("[project]", "Project name to kill")
      .option("-a, --all", "Kill all projects")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, options, command) => {
        // Validate mutually exclusive options
        if (options.all && project) {
          throw new Error(
            `Cannot specify both a project name ('${project}') and --all flag. Use either 'zap global kill ${project}' or 'zap global kill --all'.`,
          );
        }

        await this.executeCommand(
          "global",
          project ? ["kill", project] : ["kill"],
          command,
        );
      });

    // Additional shortcuts for common global operations
    this.program
      .command("ginfo [project]")
      .description("Show info for a project (shorthand for 'global info')")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, _options, command) => {
        const service = project ? ["info", project] : ["info"];
        await this.executeCommand("global", service, command);
      });

    this.program
      .command("glist")
      .alias("gl")
      .description("List all projects (shorthand for 'global list')")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        const service = ["list"];
        await this.executeCommand("global", service, command);
      });

    this.program
      .command("gkill [project]")
      .description("Kill project resources (shorthand for 'global kill')")
      .option("-a, --all", "Kill all projects")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (project, _options, command) => {
        const service = project ? ["kill", project] : ["kill"];
        await this.executeCommand("global", service, command);
      });

    this.program
      .command("gprune")
      .description("Prune stale registry entries and orphaned resources")
      .option("-y, --force", "Force the operation")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("global", ["prune"], command);
      });

    const systemCmd = this.program
      .command("system")
      .description(
        "Machine-wide Zapper project registry and orphaned resource audit",
      )
      .option("--prune", "Deprecated no-op; stale projects are always labeled")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        // No subcommand defaults to listing registered projects.
        await this.executeCommand("system", undefined, command);
      });

    systemCmd
      .command("projects")
      .description("List registered Zapper projects and validate their roots")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("system", ["projects"], command);
      });

    const registryCmd = systemCmd
      .command("registry")
      .description("Manage the machine-wide project registry")
      .action(async (_options, command) => {
        // No subcommand routes through the handler, which reports usage.
        await this.executeCommand("system", ["registry"], command);
      });

    registryCmd
      .command("prune")
      .description("Remove stale entries from the project registry")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("system", ["registry", "prune"], command);
      });

    registryCmd
      .command("forget")
      .description(
        "Forget a registry entry by id, project root, or config path",
      )
      .argument("<target>", "Registry id, project root, or config path")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (target, _options, command) => {
        await this.executeCommand(
          "system",
          ["registry", "forget", target],
          command,
        );
      });

    registryCmd
      .command("repair")
      .description("Prune stale entries and re-validate all projects")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("system", ["registry", "repair"], command);
      });

    const resourcesCmd = systemCmd
      .command("resources")
      .description("Audit and clean up orphaned system resources")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        // No subcommand defaults to an audit.
        await this.executeCommand("system", ["resources"], command);
      });

    resourcesCmd
      .command("audit")
      .description("Audit orphaned native processes and Docker containers")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("system", ["resources", "audit"], command);
      });

    resourcesCmd
      .command("cleanup")
      .description("Delete orphaned system resources after confirmation")
      .option("--include-volumes", "Include generated Docker volumes")
      .option("-y, --force", "Force cleanup operations")
      .option("-j, --json", "Output command result as minified JSON")
      .action(async (_options, command) => {
        await this.executeCommand("system", ["resources", "cleanup"], command);
      });
  }

  private async executeCommand(
    command: ZapCommand,
    service: string | string[] | undefined,
    commandInstance: Command,
  ): Promise<void> {
    // optsWithGlobals merges options from this command and every ancestor
    // (root program globals, command group, and leaf), so flags resolve
    // regardless of how deeply the subcommand is nested.
    const allOptions: Record<string, unknown> = {
      ...(commandInstance.optsWithGlobals() as Record<string, unknown>),
      __command: command,
    };

    captureCommandRun({ command, service, options: allOptions });

    const jsonMode = !!allOptions.json;
    const jsonlMode = !!allOptions.jsonl;

    if (jsonMode && jsonlMode) {
      throw new Error("Cannot specify both --json and --jsonl");
    }

    if (jsonlMode) {
      renderer.output.setJsonlMode(true);
    } else {
      renderer.output.setJsonMode(jsonMode);
    }

    try {
      if (allOptions.debug) {
        logger.setLevel(LogLevel.DEBUG);
      } else if (allOptions.verbose) {
        logger.setLevel(LogLevel.INFO);
      } else if (allOptions.quiet) {
        logger.setLevel(LogLevel.WARN);
      }

      // Keep JSON output parseable by suppressing incidental human logs.
      if (jsonMode || jsonlMode) {
        logger.setLevel(LogLevel.ERROR);
      }

      const skipConfigLoad =
        (command === "kill" &&
          typeof service === "string" &&
          service.trim().length > 0) ||
        command === "global" ||
        command === "system" ||
        command === "validate";

      const zapper = new Zapper();

      if (!skipConfigLoad) {
        await zapper.loadConfig(
          allOptions.config as string | undefined,
          allOptions,
        );
      }

      const normalizedService =
        Array.isArray(service) && service.length === 0 ? undefined : service;

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

      if (command === "status" && allOptions.watch) {
        if (jsonMode || jsonlMode) {
          throw new Error("Cannot combine --watch with --json or --jsonl");
        }

        await this.watchStatus(handler, context);
        return;
      }

      const result = await handler.execute(context);

      if (result) {
        renderCommandResult(result, {
          json: jsonMode,
          jsonl: jsonlMode,
        });

        if (result.kind === "validate" && !result.valid) {
          process.exitCode = 1;
        }
      }
    } finally {
      renderer.output.setJsonMode(false);
    }
  }

  private async watchStatus(
    handler: CommandHandler,
    context: CommandContext,
  ): Promise<void> {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let resolveWait: (() => void) | undefined;
    let previousSnapshot: string | undefined;
    let lastUpdateAt = 0;

    const stop = () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
      resolveWait?.();
    };

    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => {
        resolveWait = resolve;
        timeout = setTimeout(() => {
          resolveWait = undefined;
          resolve();
        }, delayMs);
      });

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    try {
      while (!stopped) {
        const result = await handler.execute(context);

        if (stopped) break;

        const snapshot =
          result?.kind === "status"
            ? JSON.stringify(result.statusResult)
            : undefined;

        if (
          previousSnapshot !== undefined &&
          snapshot !== undefined &&
          snapshot !== previousSnapshot
        ) {
          lastUpdateAt = Date.now();
        }

        previousSnapshot = snapshot;

        process.stdout.write("\x1B[2J\x1B[3J\x1B[H");

        if (result) {
          renderCommandResult(result, {
            json: false,
            jsonl: false,
          });
        }

        const timeSinceLastUpdate =
          lastUpdateAt === 0
            ? Number.POSITIVE_INFINITY
            : Date.now() - lastUpdateAt;

        const nextRefreshMs =
          timeSinceLastUpdate < STATUS_WATCH_ACTIVE_WINDOW_MS
            ? STATUS_WATCH_ACTIVE_INTERVAL_MS
            : STATUS_WATCH_IDLE_INTERVAL_MS;

        process.stdout.write(
          `\nWatching status. Next refresh in ${
            nextRefreshMs / 1000
          }s. Press Ctrl-C to stop.\n`,
        );

        if (!stopped) {
          await wait(nextRefreshMs);
        }
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      process.stdout.write("\n");
    }
  }

  async parse(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }

  getHelp(): string {
    return this.program.helpInformation();
  }
}
