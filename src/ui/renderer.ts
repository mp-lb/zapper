import { StatusResult, ServiceStatus } from "../core/getStatus";
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

function stripAnsi(s: string): string {
  // conservative ANSI stripper for width calc in tables
  return s.replace(/\u001B\[[0-9;]*m/g, "");
}

/** General formatting primitives */
function header(title: string, subtitle?: string): string {
  const t = subtitle ? `${title} ${dim(`(${subtitle})`)}` : title;
  return color("accent", `== ${t} ==`);
}

function block(
  kind: "WARN" | "ERROR" | "INFO",
  title: string,
  lines: string[],
): string {
  const kindTone: Tone =
    kind === "ERROR" ? "error" : kind === "WARN" ? "warn" : "info";

  const head = `${color(kindTone, kind)}  ${bold(title)}`;
  const body = lines.map((l) => `  - ${l}`).join("\n");
  return `${head}\n${body}`;
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

  isolation: {
    enabledText(instanceId: string): string {
      return `${color("ok", "OK")}  ${bold("Isolation enabled")} ${dim(`(${instanceId})`)}`;
    },
    printEnabled(instanceId: string): void {
      renderer.log.success(renderer.isolation.enabledText(instanceId));
    },

    infoText(data: {
      isolated: boolean;
      instanceId?: string;
      mode: "normal" | "isolate" | "worktree" | "exclusive";
      worktree: boolean;
      configPath?: string;
    }): string {
      const lines: string[] = [header("Isolation Status")];
      lines.push("");

      if (data.isolated) {
        lines.push(`  Status:     ${color("ok", "Isolated")}`);
        lines.push(`  Instance:   ${bold(data.instanceId!)}`);
        lines.push(`  Mode:       ${data.mode}`);
        lines.push(`  Worktree:   ${data.worktree ? "Yes" : "No"}`);
        lines.push(`  Config:     ${dim(data.configPath!)}`);
      } else if (data.worktree) {
        lines.push(`  Status:     ${color("warn", "Not isolated")}`);
        lines.push(`  Mode:       ${data.mode}`);
        lines.push(`  Worktree:   Yes`);
        lines.push("");
        lines.push(dim("  Run `zap isolate` to enable isolation"));
      } else {
        lines.push(`  Status:     ${color("muted", "Not isolated")}`);
        lines.push(`  Mode:       ${data.mode}`);
        lines.push(`  Worktree:   No`);
      }

      return lines.join("\n");
    },

    printInfo(data: {
      isolated: boolean;
      instanceId?: string;
      mode: "normal" | "isolate" | "worktree" | "exclusive";
      worktree: boolean;
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

  warnings: {
    unisolatedWorktreeText(): string {
      // Replace giant banner with a clear warning block.
      return [
        header("Warnings"),
        "",
        block("WARN", "Worktree detected", [
          "Project is running inside a git worktree",
          "No instance isolation is configured for this path",
          "Processes and containers may collide with other copies",
          "Fix: run `zap isolate` to create a local instance ID",
        ]),
      ].join("\n");
    },

    printUnisolatedWorktree(): void {
      console.warn(renderer.warnings.unisolatedWorktreeText());
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
