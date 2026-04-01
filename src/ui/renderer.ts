import { ProjectLinkResult } from "../commands/CommandResult";
import { StatusResult, ServiceStatus } from "../core/getStatus";
import { ServiceListResult, ServiceListEntry } from "../core/getServiceList";
import { Context, Task } from "../types/Context";
import { logger } from "../utils/logger";

/**
 * Renderer goals:
 * - Color-first, utilitarian output
 * - One consistent vocabulary + formatting for logs, reports, errors
 * - Minimal emojis / banners (reserve loud output for truly critical cases)
 * - Machine output stays plain (no ANSI) unless explicitly desired elsewhere
 */

interface LogOptions {
  data?: unknown;
  noEmoji?: boolean; // kept for compatibility with your logger, but renderer output avoids emoji
}

export interface TaskListItem {
  name: string;
  description?: string;
  aliases?: string[];
}

export interface TaskParamInfo {
  name: string;
  desc?: string;
  default?: string;
  required: boolean;
}

export interface TaskParamsOutput {
  name: string;
  params: TaskParamInfo[];
  acceptsRest: boolean;
}

/** ANSI helpers (intentionally small + centralized) */
const ansi = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  cyan: "\u001B[36m",
  grey: "\u001B[90m",
} as const;
const ansiEscape = String.fromCharCode(27);

type Tone = "info" | "ok" | "warn" | "error" | "muted" | "accent";

function color(tone: Tone, text: string): string {
  switch (tone) {
    case "ok":
      return `${ansi.green}${text}${ansi.reset}`;
    case "warn":
      return `${ansi.yellow}${text}${ansi.reset}`;
    case "error":
      return `${ansi.red}${text}${ansi.reset}`;
    case "muted":
      return `${ansi.grey}${text}${ansi.reset}`;
    case "accent":
      return `${ansi.cyan}${text}${ansi.reset}`;
    case "info":
    default:
      return text;
  }
}

function bold(text: string): string {
  return `${ansi.bold}${text}${ansi.reset}`;
}

function dim(text: string): string {
  return `${ansi.dim}${text}${ansi.reset}`;
}

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
}

function stripAnsi(s: string): string {
  // conservative ANSI stripper for width calc in tables
  return s.replace(new RegExp(`${ansiEscape}\\[[0-9;]*m`, "g"), "");
}

/** General formatting primitives */
function header(title: string, subtitle?: string): string {
  const t = subtitle ? `${title} ${dim(`(${subtitle})`)}` : title;
  return color("accent", `== ${t} ==`);
}

function normalizeState(state: string): "UP" | "DOWN" | "PENDING" | "UNKNOWN" {
  const s = state.toLowerCase();
  if (s === "up") return "UP";
  if (s === "down") return "DOWN";
  if (s === "pending") return "PENDING";
  return "UNKNOWN";
}

function stateTone(state: "UP" | "DOWN" | "PENDING" | "UNKNOWN"): Tone {
  if (state === "UP") return "ok";
  if (state === "DOWN") return "error";
  if (state === "PENDING") return "warn";
  return "muted";
}

function renderState(state: string, enabled: boolean): string {
  const normalized = normalizeState(state);
  if (!enabled) return color("muted", normalized);
  return color(stateTone(normalized), normalized);
}

function renderName(name: string, enabled: boolean): string {
  return enabled ? name : color("muted", name);
}

function formatStatusRow(service: ServiceStatus): {
  name: string;
  state: string;
} {
  return {
    name: renderName(service.service, service.enabled),
    state: renderState(service.status, service.enabled),
  };
}

function listRow(entry: ServiceListEntry): string[] {
  return [
    entry.type,
    entry.service,
    entry.status.toUpperCase(),
    entry.ports.join(", "),
    entry.cwd || "",
    entry.cmd,
  ];
}

function labeledList(
  headers: [string, string],
  rows: Array<[string, string]>,
): string {
  return table([
    [bold(headers[0]), bold(headers[1])],
    ...rows.map(([left, right]) => [left, right]),
  ]);
}

function keyValueLines(rows: Array<[string, string | number]>): string {
  return rows.map(([key, value]) => `  ${key}: ${value}`).join("\n");
}

/** Simple table renderer (monospace), supports ANSI in cells */
function table(rows: string[][], padding = 2): string {
  if (rows.length === 0) return "";
  const widths: number[] = [];

  for (const row of rows) {
    row.forEach((cell, i) => {
      const w = stripAnsi(cell).length;
      widths[i] = Math.max(widths[i] ?? 0, w);
    });
  }

  const pad = (s: string, w: number) => {
    const plainLen = stripAnsi(s).length;
    const spaces = Math.max(0, w - plainLen + padding);
    return s + " ".repeat(spaces);
  };

  return rows
    .map((row) => row.map((cell, i) => pad(cell, widths[i])).join(""))
    .join("\n")
    .trimEnd();
}

function formatContextSubtitle(context: Context): string {
  if (context.instanceId)
    return `${context.projectName} · ${context.instanceId}`;
  return context.projectName;
}

function taskAcceptsRest(task: Task, delimiters: [string, string]): boolean {
  const restPattern = `${delimiters[0]}REST${delimiters[1]}`;
  return task.cmds.some(
    (cmd) => typeof cmd === "string" && cmd.includes(restPattern),
  );
}

/** Error handling: keep your known error mapping, but output is consistent */
const knownErrorNames = new Set([
  "ConfigFileNotFoundError",
  "ConfigParseError",
  "ConfigValidationError",
  "ServiceNotFoundError",
  "WhitelistReferenceError",
  "ContainerNotRunningError",
  "ContainerStartError",
  "ContextNotLoadedError",
  "GitOperationError",
  "ExclusiveLockError",
]);

function asKnownError(error: unknown): Error | null {
  if (!(error instanceof Error)) return null;
  return knownErrorNames.has(error.name) ? error : null;
}

function errorCodeFromName(name: string): string {
  // Turn FooBarError -> FooBar, keep RuntimeError, etc.
  return name.replace(/Error$/, "");
}

function renderError(error: unknown, showStackTrace = false): string {
  const known = asKnownError(error);

  if (known) {
    const code = errorCodeFromName(known.name);
    let out = `${color("error", "ERROR")}  ${bold(`${code}:`)} ${known.message}`;
    if (showStackTrace && known.stack) {
      out += `\n${dim(known.stack)}`;
    }
    return out;
  }

  const name = error instanceof Error ? error.constructor.name : typeof error;
  const msg = error instanceof Error ? error.message : String(error);

  let out = `${color("error", "ERROR")}  ${bold("RuntimeError:")} ${msg || "Unexpected failure"}${dim(
    name && msg ? ` (${name})` : name ? ` (${name})` : "",
  )}`;
  if (showStackTrace && error instanceof Error && error.stack) {
    out += `\n${dim(error.stack)}`;
  }
  return out;
}

/** Configure logger sink (unchanged, but renderer uses utilitarian content) */
logger.setSink({
  log: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
});

export const renderer = {
  /**
   * Human logs (single-line, consistent). Assume logger itself handles timestamping if desired.
   * NOTE: We keep using your logger here for compatibility with existing call sites.
   */
  log: {
    error(message: string, options: LogOptions = {}): void {
      logger.error(message, { ...options, noEmoji: true });
    },
    warn(message: string, options: LogOptions = {}): void {
      logger.warn(message, { ...options, noEmoji: true });
    },
    info(message: string, options: LogOptions = {}): void {
      logger.info(message, { ...options, noEmoji: true });
    },
    debug(message: string, options: LogOptions = {}): void {
      logger.debug(message, { ...options, noEmoji: true });
    },
    success(message: string, options: LogOptions = {}): void {
      logger.success(message, { ...options, noEmoji: true });
    },
    report(text: string): void {
      logger.info(text, { noEmoji: true });
    },
  },

  /**
   * Machine output: never add ANSI, never add decorative headers.
   */
  machine: {
    line(text: string): void {
      console.log(text);
    },
    lines(texts: string[]): void {
      for (const text of texts) console.log(text);
    },
    json(data: unknown, pretty = false): void {
      console.log(
        pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data),
      );
    },
    envMap(envMap: Record<string, string>): void {
      for (const [key, value] of Object.entries(envMap)) {
        console.log(`${key}=${value}`);
      }
    },
  },

  heading: {
    text(title: string, subtitle?: string): string {
      return header(title, subtitle);
    },

    print(title: string, subtitle?: string): void {
      renderer.machine.line(renderer.heading.text(title, subtitle));
    },
  },

  confirm: {
    promptText(message: string, defaultYes = false): string {
      const suffix = defaultYes ? "[Y/n] " : "[y/N] ";
      return message.includes("\n")
        ? `${message}\n${suffix}`
        : `${message} ${suffix}`;
    },

    resetPromptText(): string {
      return "This will stop all processes and delete the .zap folder. Continue?";
    },

    zapperResetPromptText(): string {
      return "This will stop all processes and remove the .zap directory. Continue?";
    },

    deleteResourcesPromptText(): string {
      return "Delete these resources?";
    },

    killProjectPromptText(data: {
      projectName: string;
      prefix: string;
      pm2Count: number;
      containerCount: number;
    }): string {
      return [
        `This will permanently delete all PM2 processes and Docker containers across ALL instances for project "${data.projectName}".`,
        "",
        keyValueLines([
          ["Prefix", `${data.prefix}.`],
          ["PM2 processes", data.pm2Count],
          ["Containers", data.containerCount],
        ]),
      ].join("\n");
    },

    globalKillAllPromptText(data: {
      projectCount: number;
      projectNames: string[];
      pm2Count: number;
      containerCount: number;
    }): string {
      return [
        "This will permanently delete ALL PM2 processes and Docker containers for ALL zap projects.",
        "",
        `Projects (${data.projectCount}):`,
        ...data.projectNames.map((name) => `  - ${name}`),
        "",
        keyValueLines([
          ["PM2 processes", data.pm2Count],
          ["Containers", data.containerCount],
        ]),
      ].join("\n");
    },
  },

  command: {
    abortedText(): string {
      return "Aborted.";
    },

    openingText(url: string): string {
      return `Opening ${url}`;
    },

    killNoResourcesText(projectName: string, prefix: string): string {
      return `No PM2 processes or Docker containers found across any instance for project ${projectName} (${prefix}.).`;
    },

    killCompletedText(data: {
      projectName: string;
      prefix: string;
      pm2Count: number;
      containerCount: number;
    }): string {
      return `Killed ${data.pm2Count} PM2 process(es) and ${data.containerCount} container(s) across all instances for project ${data.projectName} (${data.prefix}.).`;
    },

    profileEnabledText(profile: string): string {
      return `Enabling profile: ${profile}`;
    },

    profileNoServicesText(profile: string): string {
      return `No services found for profile: ${profile}`;
    },

    profileStartingServicesText(services: string[]): string {
      return `Starting services: ${services.join(", ")}`;
    },

    noActiveProfileToDisableText(): string {
      return "No active profile to disable";
    },

    profileDisablingText(profile: string): string {
      return `Disabling active profile: ${profile}`;
    },

    profileDisabledText(): string {
      return "Active profile disabled";
    },

    profileAdjustingServicesText(): string {
      return "Adjusting services to match new state...";
    },

    environmentEnabledText(environment: string): string {
      return `Enabling environment: ${environment}`;
    },

    environmentUpdatedText(): string {
      return "Environment updated. Restart services to apply new environment variables.";
    },

    noActiveEnvironmentToDisableText(): string {
      return "No active environment to disable";
    },

    environmentDisablingText(environment: string): string {
      return `Disabling active environment: ${environment}`;
    },

    environmentResetText(): string {
      return "Environment reset to default. Restart services to apply new environment variables.";
    },

    noProjectsFoundText(): string {
      return "No zap projects found.";
    },

    globalListText(
      projects: Array<{
        name: string;
        pm2: string[];
        containers: string[];
      }>,
      allProjects = false,
    ): string {
      const sections: string[] = [];

      for (const project of projects) {
        const projectSections: string[] = [];
        const rows: Array<[string, string]> = [];

        if (allProjects) {
          const totalResources = project.pm2.length + project.containers.length;
          projectSections.push(
            renderer.heading.text(
              project.name,
              `${totalResources} ${pluralize(totalResources, "resource")}`,
            ),
          );
        } else {
          projectSections.push(renderer.heading.text(project.name));
        }

        for (const process of project.pm2) {
          rows.push(["PM2", process]);
        }

        for (const container of project.containers) {
          rows.push(["DOCKER", container]);
        }

        if (project.pm2.length === 0 && project.containers.length === 0) {
          projectSections.push("");
          projectSections.push(dim("No resources found"));
        } else {
          projectSections.push("");
          projectSections.push(labeledList(["TYPE", "RESOURCE"], rows));
        }

        sections.push(projectSections.join("\n"));
      }

      return sections.join("\n\n");
    },

    noProjectsFoundToKillText(): string {
      return "No zap projects found to kill.";
    },

    noResourcesFoundToKillText(): string {
      return "No resources found to kill.";
    },

    globalKillAllCompletedText(data: {
      projectCount: number;
      pm2Count: number;
      containerCount: number;
    }): string {
      return `Killed ${data.pm2Count} PM2 process(es) and ${data.containerCount} container(s) across ${data.projectCount} project(s).`;
    },

    globalKillProjectCompletedText(data: {
      projectName: string;
      prefix: string;
      pm2Count: number;
      containerCount: number;
    }): string {
      return `Killed ${data.pm2Count} PM2 process(es) and ${data.containerCount} container(s) for project ${data.projectName} (${data.prefix}.).`;
    },

    initInstanceText(instanceKey: string, instanceId?: string): string {
      return `Initialized instance "${instanceKey}" (${instanceId})`;
    },

    initPortsText(data: {
      randomized: boolean;
      portCount: number;
      path: string;
    }): string {
      return `${data.randomized ? "Randomized" : "Initialized"} ${data.portCount} port(s) in ${data.path}`;
    },

    envAssignmentText(name: string, value: string): string {
      return `  ${name}=${value}`;
    },

    removedZapDirText(): string {
      return "Removed .zap directory.";
    },

    missingZapDirText(): string {
      return ".zap directory does not exist.";
    },
  },

  isolation: {
    enabledText(instanceId: string): string {
      return `${color("ok", "OK")}  ${bold("Instance ready")} ${dim(`(${instanceId})`)}`;
    },
    printEnabled(instanceId: string): void {
      renderer.log.success(renderer.isolation.enabledText(instanceId));
    },

    infoText(data: {
      isolated: boolean;
      instanceId?: string;
      mode: "normal" | "isolate" | "exclusive";
      configPath?: string;
    }): string {
      const lines: string[] = [header("Instance Status")];
      lines.push("");

      if (data.isolated) {
        lines.push(`  Status:     ${color("ok", "Ready")}`);
        lines.push(`  Instance:   ${bold(data.instanceId!)}`);
        lines.push(`  Mode:       ${data.mode}`);
        if (data.configPath) {
          lines.push(`  Config:     ${dim(data.configPath)}`);
        }
      } else {
        lines.push(`  Status:     ${color("muted", "Not initialized")}`);
        lines.push(`  Mode:       ${data.mode}`);
      }

      return lines.join("\n");
    },

    printInfo(data: {
      isolated: boolean;
      instanceId?: string;
      mode: "normal" | "isolate" | "exclusive";
      configPath?: string;
    }): void {
      renderer.log.report(renderer.isolation.infoText(data));
    },
  },

  status: {
    contextHeaderText(context: Context): string {
      // kept for backwards compatibility; prefer using status.toText which includes a unified header
      const subtitle = formatContextSubtitle(context);
      return `${header("Status", subtitle)}\n`;
    },

    toText(statusResult: StatusResult, context?: Context): string {
      const titleSubtitle = context
        ? formatContextSubtitle(context)
        : undefined;
      const sections: string[] = [header("Status", titleSubtitle)];

      const addSection = (
        label: "NATIVE" | "DOCKER",
        items: ServiceStatus[],
      ) => {
        if (items.length === 0) return;

        const rows = items.map(formatStatusRow);

        const nameWidth = Math.max(
          ...rows.map((r) => stripAnsi(r.name).length),
          0,
        );

        const lines = rows.map((r) => {
          // align: name padded, state after
          const pad = " ".repeat(
            Math.max(0, nameWidth - stripAnsi(r.name).length + 2),
          );
          return `  ${r.name}${pad}${r.state}`;
        });

        sections.push(`${bold(label)}\n${lines.join("\n")}`);
      };

      addSection("NATIVE", statusResult.native);
      addSection("DOCKER", statusResult.docker);

      return sections.join("\n\n");
    },

    toJson(statusResult: StatusResult): StatusResult {
      return statusResult;
    },
  },

  list: {
    toText(result: ServiceListResult, context: Context): string {
      const subtitle = formatContextSubtitle(context);
      const rows: string[][] = [
        [
          bold("TYPE"),
          bold("SERVICE"),
          bold("STATUS"),
          bold("PORTS"),
          bold("CWD"),
          bold("CMD"),
        ],
      ];

      for (const service of result.services) {
        rows.push(listRow(service));
      }

      return [header("Services", subtitle), "", table(rows)].join("\n");
    },

    toJson(result: ServiceListResult): ServiceListResult {
      return result;
    },
  },

  tasks: {
    toText(tasks: Task[]): string {
      if (tasks.length === 0)
        return `${header("Tasks")}\n\n${dim("No tasks defined")}`;

      const rows: string[][] = [
        [bold("NAME"), bold("DESCRIPTION"), bold("ALIASES")],
      ];

      for (const t of tasks) {
        const desc = t.desc ?? "";
        const aliases =
          t.aliases && t.aliases.length > 0 ? t.aliases.join(", ") : "";
        rows.push([t.name, desc, aliases]);
      }

      return [header("Tasks"), "", table(rows)].join("\n");
    },

    toJson(tasks: Task[]): TaskListItem[] {
      return tasks.map((task) => ({
        name: task.name,
        description: task.desc,
        aliases: task.aliases,
      }));
    },

    paramsToJson(
      task: Task,
      delimiters: [string, string] = ["{{", "}}"],
    ): TaskParamsOutput {
      const params: TaskParamInfo[] = (task.params || []).map((param) => ({
        name: param.name,
        desc: param.desc,
        default: param.default,
        required: param.required === true && param.default === undefined,
      }));

      return {
        name: task.name,
        params,
        acceptsRest: taskAcceptsRest(task, delimiters),
      };
    },
  },

  links: {
    toText(links: ProjectLinkResult[]): string {
      if (links.length === 0)
        return `${header("Links")}\n\n${dim("No links configured")}`;

      return labeledList(
        ["Name", "URL"],
        links.map((link) => [
          link.isHomepage ? `${link.name} ${dim("(homepage)")}` : link.name,
          link.url,
        ]),
      );
    },

    toJson(links: ProjectLinkResult[]): ProjectLinkResult[] {
      return links;
    },
  },

  profiles: {
    toText(profiles: string[]): string {
      if (profiles.length === 0)
        return `${header("Profile")}\n\n${dim("No profiles defined")}`;
      // keep this minimal: list only
      return [
        header("Profiles"),
        "",
        profiles.map((p) => `  ${p}`).join("\n"),
      ].join("\n");
    },

    toJson(profiles: string[]): string[] {
      return profiles;
    },

    pickerText(profiles: string[], activeProfile?: string): string {
      if (profiles.length === 0)
        return `${header("Profile")}\n\n${dim("No profiles defined")}`;

      const lines: string[] = [header("Profile")];

      if (activeProfile) lines.push(`Active: ${bold(activeProfile)}`);

      lines.push("");
      for (const p of profiles) {
        const isActive = p === activeProfile;
        const mark = isActive ? color("ok", "*") : " ";
        lines.push(`${mark} ${p}`);
      }

      lines.push("");
      lines.push(dim("Use: zap profile <name>"));

      return lines.join("\n");
    },
  },

  environments: {
    toText(environments: string[]): string {
      if (environments.length === 0)
        return `${header("Environment")}\n\n${dim("No environments defined")}`;
      return [
        header("Environments"),
        "",
        environments.map((e) => `  ${e}`).join("\n"),
      ].join("\n");
    },

    toJson(environments: string[]): string[] {
      return environments;
    },

    pickerText(environments: string[], activeEnvironment?: string): string {
      if (environments.length === 0)
        return `${header("Environment")}\n\n${dim("No environments defined")}`;

      const lines: string[] = [header("Environment")];

      if (activeEnvironment) lines.push(`Active: ${bold(activeEnvironment)}`);

      lines.push("");
      for (const e of environments) {
        const isActive = e === activeEnvironment;
        const mark = isActive ? color("ok", "*") : " ";
        lines.push(`${mark} ${e}`);
      }

      lines.push("");
      lines.push(dim("Use: zap env <name>"));

      return lines.join("\n");
    },
  },

  errors: {
    format(error: unknown, showStackTrace = false): string {
      // Keep this a pure formatter; caller decides where/how to print.
      return renderError(error, showStackTrace);
    },

    print(error: unknown, showStackTrace = false): void {
      console.error(renderer.errors.format(error, showStackTrace));
    },
  },
};
