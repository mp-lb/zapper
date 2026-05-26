import { renderer } from "./ui/renderer";
import type { ZodIssue } from "zod";

export class ConfigFileNotFoundError extends Error {
  constructor(
    public configPath: string,
    message?: string,
  ) {
    super(message || `Config file not found: ${configPath}`);
    this.name = "ConfigFileNotFoundError";
  }
}

export class ConfigParseError extends Error {
  constructor(
    public configPath: string,
    public cause?: unknown,
    message?: string,
  ) {
    super(message || `Failed to parse config file: ${configPath}`);
    this.name = "ConfigParseError";
  }
}

export class ConfigValidationError extends Error {
  public zodIssues?: ZodIssue[];

  constructor(
    public issues: string[],
    zodIssuesOrMessage?: ZodIssue[] | string,
    message?: string,
  ) {
    const resolvedMessage =
      typeof zodIssuesOrMessage === "string" ? zodIssuesOrMessage : message;
    super(
      resolvedMessage ||
        `Configuration validation failed: ${issues.join(", ")}`,
    );
    this.name = "ConfigValidationError";
    if (Array.isArray(zodIssuesOrMessage)) {
      this.zodIssues = zodIssuesOrMessage;
    }
  }
}

export class ServiceNotFoundError extends Error {
  constructor(
    public serviceName: string,
    message?: string,
  ) {
    super(
      message ||
        `Service not found: ${serviceName}. Check service names or aliases`,
    );
    this.name = "ServiceNotFoundError";
  }
}

export class TaskNotFoundError extends Error {
  constructor(
    public taskName: string,
    message?: string,
  ) {
    super(
      message || `Task not found: ${taskName}. Check task names or aliases`,
    );
    this.name = "TaskNotFoundError";
  }
}

export class WhitelistReferenceError extends Error {
  constructor(
    public whitelistName: string,
    public entityType: string,
    public entityName: string,
    public availableWhitelists?: string[],
    message?: string,
  ) {
    super(
      message ||
        `${entityType} '${entityName}' references unknown whitelist '${whitelistName}'` +
          (availableWhitelists && availableWhitelists.length > 0
            ? `. Available whitelists: ${availableWhitelists.join(", ")}`
            : ""),
    );
    this.name = "WhitelistReferenceError";
  }
}

export class ContainerNotRunningError extends Error {
  constructor(
    public containerName: string,
    public dockerName?: string,
    message?: string,
  ) {
    super(
      message ||
        `Container not running: ${containerName}` +
          (dockerName ? ` (${dockerName})` : ""),
    );
    this.name = "ContainerNotRunningError";
  }
}

export class ContainerStartError extends Error {
  constructor(
    public serviceName: string,
    public dockerName: string,
    public summary: string,
    message?: string,
  ) {
    super(
      message ||
        `Failed to start Docker service: ${serviceName} (${dockerName}). ${summary}` +
          ` Run \`zap startup-log ${serviceName}\` for details.`,
    );
    this.name = "ContainerStartError";
  }
}

export class ContextNotLoadedError extends Error {
  constructor(message?: string) {
    super(message || "Context not loaded");
    this.name = "ContextNotLoadedError";
  }
}

export class GitOperationError extends Error {
  constructor(
    public operation: string,
    public repoPath?: string,
    message?: string,
  ) {
    super(
      message ||
        `Git ${operation} failed` + (repoPath ? ` for ${repoPath}` : ""),
    );
    this.name = "GitOperationError";
  }
}

export class ExclusiveLockError extends Error {
  constructor(
    public projectName: string,
    public lockInfo: { projectRoot: string; pid: number; timestamp: string },
  ) {
    super(
      `Project "${projectName}" is already running from ${lockInfo.projectRoot}. Stop it first or use --force to take over.`,
    );
    this.name = "ExclusiveLockError";
  }
}

export class PromptCancelledError extends Error {
  constructor(message = "Aborted.") {
    super(message);
    this.name = "PromptCancelledError";
  }
}

export function isPromptCancelledError(error: unknown): boolean {
  if (error instanceof PromptCancelledError) return true;
  if (!(error instanceof Error)) return false;

  const maybeNodeError = error as Error & { code?: unknown };
  return (
    error.name === "PromptCancelledError" ||
    maybeNodeError.code === "ERR_USE_AFTER_CLOSE"
  );
}

export function formatError(error: unknown, showStackTrace = false): string {
  return renderer.errors.format(error, showStackTrace);
}
