import { renderer } from "./ui/renderer";

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
  constructor(
    public issues: string[],
    message?: string,
  ) {
    super(message || `Configuration validation failed: ${issues.join(", ")}`);
    this.name = "ConfigValidationError";
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

export function formatError(error: unknown, showStackTrace = false): string {
  return renderer.errors.format(error, showStackTrace);
}
