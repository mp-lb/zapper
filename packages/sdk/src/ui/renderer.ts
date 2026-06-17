import { ProjectLinkResult } from "../commands/CommandResult";
import { StatusResult, ServiceStatus } from "../core/getStatus";
import {
  ResourceInventoryEntry,
  ServiceListEntry,
  ServiceListResult,
} from "../core/getServiceList";
import type {
  SystemProjectStatus,
  SystemResourceAuditEntry,
  SystemRegistryProject,
} from "../system";
import { Context, Task } from "../types/Context";
import { logger } from "../utils/logger";
import { getInstanceDisplayLabel } from "../core/instanceResolver";

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
type OutputMode = "text" | "json" | "jsonl";

let outputMode: OutputMode = "text";

function isJsonOutputMode(): boolean {
  return outputMode === "json" || outputMode === "jsonl";
}

function renderHumanOutput(fn: () => void): void {
  if (isJsonOutputMode()) return;
  fn();
}

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
function headerTitle(text: string): string {
  return color("accent", text);
}

function headerSubtitle(text: string): string {
  return dim(`(${text})`);
}

function headerRow(segments: string[]): string {
  return [color("accent", "=="), ...segments, color("accent", "==")].join(" ");
}

function header(title: string, subtitle?: string): string {
  return headerRow(
    subtitle
      ? [headerTitle(title), headerSubtitle(subtitle)]
      : [headerTitle(title)],
  );
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
    entry.volumes.join(", "),
    entry.cwd || "",
    entry.cmd,
  ];
}

function serviceListRows(entries: ServiceListEntry[]): string[][] {
  return [
    [
      bold("TYPE"),
      bold("SERVICE"),
      bold("STATUS"),
      bold("VOLUMES"),
      bold("CWD"),
      bold("CMD"),
    ],
    ...entries.map((service) => listRow(service)),
  ];
}

function instanceServicesHeading(
  instanceId: string,
  instanceKey: string,
  label?: string,
): string {
  const displayLabel = getInstanceDisplayLabel({ id: instanceId, label });
  const idSuffix = displayLabel === instanceId ? "" : ` (${instanceId})`;
  return instanceKey
    ? `Instance ${displayLabel}${idSuffix} (${instanceKey})`
    : `Instance ${displayLabel}${idSuffix}`;
}

function portListRows(result: Pick<ServiceListResult, "ports">): string[][] {
  return [
    [bold("NAME"), bold("PORT")],
    ...result.ports.map((port) => [port.name, port.value]),
  ];
}

function serviceListTables(
  heading: string,
  result: Pick<ServiceListResult, "services" | "ports">,
): Array<{ heading: string; rows: string[][] }> {
  const tables = [{ heading, rows: serviceListRows(result.services) }];
  const portsRows = portListRows(result);

  if (portsRows.length > 1) {
    tables.push({ heading: "Ports", rows: portsRows });
  }

  return tables;
}

function systemProjectRows(projects: SystemProjectStatus[]): string[][] {
  return [
    [
      bold("PROJECT"),
      bold("STATE"),
      bold("INSTANCES"),
      bold("SERVICES"),
      bold("LAST SEEN"),
      bold("ROOT"),
    ],
    ...projects.map((project) => {
      const serviceCount = project.instances.reduce(
        (sum, instance) => sum + (instance.list?.services.length || 0),
        0,
      );

      return [
        project.project,
        project.state.toUpperCase(),
        String(project.instances.length),
        String(serviceCount),
        project.lastSeenAt,
        project.projectRoot,
      ];
    }),
  ];
}

function registryProjectRows(projects: SystemRegistryProject[]): string[][] {
  return [
    [bold("PROJECT"), bold("ROOT"), bold("CONFIG")],
    ...projects.map((project) => [
      project.project,
      project.projectRoot,
      project.configPath,
    ]),
  ];
}

function auditResourceRows(resources: SystemResourceAuditEntry[]): string[][] {
  return [
    [bold("TYPE"), bold("RESOURCE"), bold("CLASSIFICATION"), bold("LOCATION")],
    ...resources.map((resource) => [
      resource.type,
      resource.name,
      resource.classification,
      resource.location,
    ]),
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

function resourceRowsByType(
  entries: ResourceInventoryEntry[],
  type: "pm2" | "container" | "volume",
): string[][] {
  return entries
    .filter((entry) => entry.type === type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => [entry.name, entry.reason]);
}

function keyValueLines(rows: Array<[string, string | number]>): string {
  return rows.map(([key, value]) => `  ${key}: ${value}`).join("\n");
}

function multiTableView(
  title: string,
  subtitle: string,
  tables: Array<{ heading: string; rows: string[][] }>,
  footer?: string,
): string {
  const sections = [header(title, subtitle)];

  for (const tableDef of tables) {
    sections.push("", bold(tableDef.heading), table(tableDef.rows));
  }

  if (footer) {
    sections.push("", footer);
  }

  return sections.join("\n");
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
  const stackCount = Object.keys(context.state.stacks ?? {}).length;
  const profileName = context.profile?.name;

  if (profileName && profileName !== "default") {
    if (context.instanceId && stackCount > 1) {
      return `${context.projectName} [${profileName} - ${context.instanceId} - ${stackCount} stacks]`;
    }

    return `${context.projectName} [${profileName}]`;
  }

  if (context.instanceId && stackCount > 1) {
    return `${context.projectName} [${context.instanceId} - ${stackCount} stacks]`;
  }

  if (context.instanceId && context.instanceKey !== "default") {
    const label = getInstanceDisplayLabel({
      id: context.instanceId,
      label: context.instance?.label,
    });

    const suffix =
      label === context.instanceId ? label : `${label} (${context.instanceId})`;

    return `${context.projectName} · ${suffix}`;
  }

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
  "TaskNotFoundError",
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
  output: {
    setJsonMode(enabled: boolean): void {
      outputMode = enabled ? "json" : "text";
    },
    setJsonlMode(enabled: boolean): void {
      outputMode = enabled ? "jsonl" : "text";
    },
    isJsonMode(): boolean {
      return outputMode === "json";
    },
    isJsonlMode(): boolean {
      return outputMode === "jsonl";
    },
  },

  /**
   * Human logs (single-line, consistent). Assume logger itself handles timestamping if desired.
   * NOTE: We keep using your logger here for compatibility with existing call sites.
   */
  log: {
    error(message: string, options: LogOptions = {}): void {
      renderHumanOutput(() => {
        logger.error(message, { ...options, noEmoji: true });
      });
    },
    warn(message: string, options: LogOptions = {}): void {
      renderHumanOutput(() => {
        logger.warn(message, { ...options, noEmoji: true });
      });
    },
    info(message: string, options: LogOptions = {}): void {
      renderHumanOutput(() => {
        logger.info(message, { ...options, noEmoji: true });
      });
    },
    debug(message: string, options: LogOptions = {}): void {
      renderHumanOutput(() => {
        logger.debug(message, { ...options, noEmoji: true });
      });
    },
    success(message: string, options: LogOptions = {}): void {
      renderHumanOutput(() => {
        logger.success(message, { ...options, noEmoji: true });
      });
    },
    report(text: string): void {
      renderHumanOutput(() => {
        logger.info(text, { noEmoji: true });
      });
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
        `This will permanently delete all native processes and Docker containers across ALL instances for project "${data.projectName}".`,
        "",
        keyValueLines([
          ["Prefix", `${data.prefix}.`],
          ["Native processes", data.pm2Count],
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
        "This will permanently delete ALL native processes and Docker containers for ALL zap projects.",
        "",
        `Projects (${data.projectCount}):`,
        ...data.projectNames.map((name) => `  - ${name}`),
        "",
        keyValueLines([
          ["Native processes", data.pm2Count],
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
      return `No native processes or Docker containers found across any instance for project ${projectName} (${prefix}.).`;
    },

    killCompletedText(data: {
      projectName: string;
      prefix: string;
      pm2Count: number;
      containerCount: number;
    }): string {
      return `Killed ${data.pm2Count} native process(es) and ${data.containerCount} container(s) across all instances for project ${data.projectName} (${data.prefix}.).`;
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
          rows.push(["Native", process]);
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

    globalOrphansText(
      orphans: Array<{
        name: string;
        location: string;
        reason: string;
      }>,
    ): string {
      const sections: string[] = [
        renderer.heading.text(
          "Orphaned processes",
          `${orphans.length} ${pluralize(orphans.length, "process", "processes")}`,
        ),
        "",
        labeledList(
          ["PROCESS", "DETAILS"],
          orphans.map((orphan): [string, string] => [
            orphan.name,
            `${orphan.location} — ${orphan.reason}`,
          ]),
        ),
        "",
        dim("Run `zap global prune` to clean these up"),
      ];

      return sections.join("\n");
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
      return `Killed ${data.pm2Count} native process(es) and ${data.containerCount} container(s) across ${data.projectCount} project(s).`;
    },

    globalKillProjectCompletedText(data: {
      projectName: string;
      prefix: string;
      pm2Count: number;
      containerCount: number;
    }): string {
      return `Killed ${data.pm2Count} native process(es) and ${data.containerCount} container(s) for project ${data.projectName} (${data.prefix}.).`;
    },

    globalPrunePlanText(data: {
      staleProjects: SystemRegistryProject[];
      resources: SystemResourceAuditEntry[];
    }): string {
      const sections: string[] = [];

      if (data.staleProjects.length > 0) {
        sections.push(
          [
            header("Stale Registry Entries"),
            "",
            renderer.system.registryProjectsToText(data.staleProjects),
          ].join("\n"),
        );
      }

      if (data.resources.length > 0) {
        sections.push(renderer.system.resourcesToText(data.resources));
      }

      return sections.join("\n\n");
    },

    globalPruneCompletedText(data: {
      status: "aborted" | "completed";
      staleProjects: SystemRegistryProject[];
      removedProjects: SystemRegistryProject[];
      resources: SystemResourceAuditEntry[];
    }): string {
      const resourceCount = data.resources.length;

      if (data.status === "aborted") {
        const projectCount = data.staleProjects.length;
        return [
          `Found ${projectCount} stale registry entr${projectCount === 1 ? "y" : "ies"} and ${resourceCount} orphaned resource${resourceCount === 1 ? "" : "s"}. Cleanup aborted.`,
          "",
          renderer.command.globalPrunePlanText({
            staleProjects: data.staleProjects,
            resources: data.resources,
          }),
        ].join("\n");
      }

      const projectCount = data.removedProjects.length;
      return [
        `Pruned ${projectCount} stale registry entr${projectCount === 1 ? "y" : "ies"} and cleaned ${resourceCount} orphaned resource${resourceCount === 1 ? "" : "s"}.`,
        "",
        renderer.system.resourcesToText(data.resources),
      ].join("\n");
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

    instanceLabeledText(data: {
      instanceKey: string;
      instanceId: string;
      label: string;
    }): string {
      return `Labeled instance "${data.instanceKey}" as "${data.label}" (${data.instanceId}).`;
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

      const resources = result.resources;

      if (!resources) {
        return multiTableView(
          "Services",
          subtitle,
          serviceListTables("Services", result),
        );
      }

      const tables: Array<{ heading: string; rows: string[][] }> =
        resources.instances.length > 0
          ? resources.instances.flatMap((instance) =>
              serviceListTables(
                instanceServicesHeading(
                  instance.instanceId,
                  instance.instanceKey,
                  instance.label,
                ),
                instance,
              ),
            )
          : serviceListTables("Services", result);

      if (resources.dangling.length > 0) {
        const danglingRows = [
          [bold("TYPE"), bold("NAME"), bold("WHY")],
          ...resources.dangling.map((entry) => [
            entry.type,
            entry.name,
            entry.reason,
          ]),
        ];

        tables.push({ heading: "Dangling Resources", rows: danglingRows });
      }

      if (resources.alien.length > 0) {
        const unrecognizedTables: Array<{
          heading: string;
          rows: string[][];
        }> = [
          {
            heading: "Unrecognized Processes",
            rows: [
              [bold("NAME"), bold("WHY")],
              ...resourceRowsByType(resources.alien, "pm2"),
            ],
          },
          {
            heading: "Unrecognized Containers",
            rows: [
              [bold("NAME"), bold("WHY")],
              ...resourceRowsByType(resources.alien, "container"),
            ],
          },
          {
            heading: "Unrecognized Volumes",
            rows: [
              [bold("NAME"), bold("WHY")],
              ...resourceRowsByType(resources.alien, "volume"),
            ],
          },
        ];

        for (const tableDef of unrecognizedTables) {
          if (tableDef.rows.length > 1) tables.push(tableDef);
        }
      }

      return multiTableView(
        "Services",
        subtitle,
        tables,
        resources.staleVolumes.length > 0
          ? dim(
              "Run `zap volume prune` to remove stale generated Docker volumes.",
            )
          : undefined,
      );
    },

    toJson(result: ServiceListResult): ServiceListResult {
      return result;
    },
  },

  system: {
    projectsToText(projects: SystemProjectStatus[]): string {
      if (projects.length === 0) {
        return `${header("System Projects")}\n\n${dim("No system projects registered.")}`;
      }

      return [
        header("System Projects"),
        "",
        table(systemProjectRows(projects)),
      ].join("\n");
    },

    projectsToJson(projects: SystemProjectStatus[]): SystemProjectStatus[] {
      return projects;
    },

    registryProjectsToText(projects: SystemRegistryProject[]): string {
      if (projects.length === 0) return dim("No registry entries changed.");
      return table(registryProjectRows(projects));
    },

    registryProjectsToJson(
      projects: SystemRegistryProject[],
    ): SystemRegistryProject[] {
      return projects;
    },

    resourcesToText(resources: SystemResourceAuditEntry[]): string {
      if (resources.length === 0) {
        return `${header("Orphaned Resources")}\n\n${dim("No orphaned system resources found.")}`;
      }

      return [
        header("Orphaned Resources"),
        "",
        table(auditResourceRows(resources)),
      ].join("\n");
    },

    resourcesToJson(
      resources: SystemResourceAuditEntry[],
    ): SystemResourceAuditEntry[] {
      return resources;
    },

    registryPrunedText(removed: SystemRegistryProject[]): string {
      const count = removed.length;
      return [
        `Pruned ${count} system registry entr${count === 1 ? "y" : "ies"}.`,
        "",
        renderer.system.registryProjectsToText(removed),
      ].join("\n");
    },

    registryForgotText(removed: SystemRegistryProject | null): string {
      if (!removed) return "No matching system registry entry found.";
      return [
        "Forgot system registry entry:",
        "",
        renderer.system.registryProjectsToText([removed]),
      ].join("\n");
    },

    registryRepairedText(data: {
      removed: SystemRegistryProject[];
      projects: SystemProjectStatus[];
    }): string {
      const count = data.removed.length;
      return [
        `Repaired system registry. Pruned ${count} stale entr${count === 1 ? "y" : "ies"}.`,
        "",
        renderer.system.projectsToText(data.projects),
      ].join("\n");
    },

    resourcesCleanedText(data: {
      status: "aborted" | "completed";
      resources: SystemResourceAuditEntry[];
    }): string {
      if (data.status === "aborted") return renderer.command.abortedText();
      const count = data.resources.length;
      return [
        `Cleaned ${count} system resource${count === 1 ? "" : "s"}.`,
        "",
        renderer.system.resourcesToText(data.resources),
      ].join("\n");
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
