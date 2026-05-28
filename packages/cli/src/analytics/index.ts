import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { homedir, platform, release } from "os";
import { join } from "path";
import { URL } from "url";
import packageJson from "../../package.json";
import { bundledPostHogHost, bundledPostHogKey } from "./buildConfig";
import type { Command as ZapCommand } from "../types/index";

type SourceEnv = "development" | "staging" | "production";

interface EventRecord {
  id?: string;
  eventType: string;
  module?: string;
  message?: string;
  timestamp?: string;
  userId?: string;
  source?: {
    module?: string;
    platform?: string;
    env?: SourceEnv;
    service?: string;
    os?: string;
    version?: string;
    user_agent?: string;
  };
  details?: Record<string, unknown>;
}

interface CommandRunInput {
  command: ZapCommand;
  service: string | string[] | undefined;
  options: Record<string, unknown>;
}

const POSTHOG_KEY_PLACEHOLDER = "__ZAPPER_POSTHOG_KEY__";
const POSTHOG_HOST_PLACEHOLDER = "__ZAPPER_POSTHOG_HOST__";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const CAPTURE_TIMEOUT_MS = 300;

function isAnalyticsDisabled(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.ZAPPER_ANALYTICS_DISABLED === "1" ||
    process.env.DO_NOT_TRACK === "1"
  );
}

function configuredPostHogKey(): string | undefined {
  const key = process.env.POSTHOG_KEY || bundledPostHogKey;
  if (!key || key === POSTHOG_KEY_PLACEHOLDER) return undefined;
  return key;
}

function configuredPostHogHost(): string {
  const host = process.env.POSTHOG_HOST || bundledPostHogHost;
  if (!host || host === POSTHOG_HOST_PLACEHOLDER) return DEFAULT_POSTHOG_HOST;
  return host;
}

function sourceEnv(): SourceEnv {
  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.NODE_ENV === "staging") return "staging";
  return "production";
}

function analyticsIdPath(): string {
  return join(homedir(), ".config", "zapper", "analytics-id");
}

function getOrCreateAnalyticsId(): string | undefined {
  if (process.env.ZAPPER_ANALYTICS_ID) return process.env.ZAPPER_ANALYTICS_ID;

  try {
    const idPath = analyticsIdPath();
    if (existsSync(idPath)) {
      const existing = readFileSync(idPath, "utf8").trim();
      if (existing) return existing;
    }

    const id = randomUUID();
    mkdirSync(join(homedir(), ".config", "zapper"), { recursive: true });
    writeFileSync(idPath, `${id}\n`, { mode: 0o600 });
    return id;
  } catch {
    return undefined;
  }
}

function firstServicePart(
  service: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(service)) return service[0];
  return service;
}

function commandPathFor(input: CommandRunInput): string[] {
  if (input.command.startsWith("git:")) {
    return ["git", input.command.slice("git:".length)];
  }

  if (input.command === "task") {
    return typeof input.service === "string"
      ? ["task", "run"]
      : ["task", "list"];
  }

  const subcommand = firstServicePart(input.service);
  if (
    subcommand &&
    ["profile", "global", "volume", "instance", "stack", "system"].includes(
      input.command,
    )
  ) {
    return [input.command, subcommand];
  }

  return [input.command];
}

function targetCount(service: string | string[] | undefined): number {
  if (Array.isArray(service)) return service.length;
  return service ? 1 : 0;
}

function commandDetails(input: CommandRunInput): Record<string, unknown> {
  const commandPath = commandPathFor(input);
  const commandName = commandPath.join(" ");

  return {
    schemaVersion: 1,
    origin: "cli",
    command: commandName,
    commandPath,
    command_l1: commandPath[0],
    command_l2:
      commandPath.length >= 2 ? commandPath.slice(0, 2).join(" ") : undefined,
    command_l3:
      commandPath.length >= 3 ? commandPath.slice(0, 3).join(" ") : undefined,
    handler: input.command,
    json: !!input.options.json,
    jsonl: !!input.options.jsonl,
    hasConfigOverride: typeof input.options.config === "string",
    hasProfile: typeof input.options.profile === "string",
    hasInstance: typeof input.options.instance === "string",
    targetCount: targetCount(input.service),
  };
}

function postHogCaptureUrl(host: string): string {
  return `${host.replace(/\/$/, "")}/capture/`;
}

export function buildCommandRunEvent(
  input: CommandRunInput,
): EventRecord | undefined {
  const userId = getOrCreateAnalyticsId();
  if (!userId) return undefined;

  return {
    id: randomUUID(),
    eventType: "command.run",
    module: "cli",
    timestamp: new Date().toISOString(),
    userId,
    source: {
      module: "CommanderCli",
      platform: "cli",
      env: sourceEnv(),
      os: `${platform()} ${release()}`,
      version: packageJson.version,
    },
    details: commandDetails(input),
  };
}

export function captureCommandRun(input: CommandRunInput): void {
  if (isAnalyticsDisabled()) return;

  const apiKey = configuredPostHogKey();
  if (!apiKey) return;

  const event = buildCommandRunEvent(input);
  if (!event?.userId) return;

  const body = JSON.stringify({
    api_key: apiKey,
    event: event.eventType,
    distinct_id: event.userId,
    properties: event,
  });

  sendPostHogCapture(postHogCaptureUrl(configuredPostHogHost()), body);
}

function sendPostHogCapture(url: string, body: string): void {
  try {
    const endpoint = new URL(url);
    const requestFn =
      endpoint.protocol === "http:" ? httpRequest : httpsRequest;
    const request = requestFn(
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
      },
    );

    const timeout = setTimeout(() => request.destroy(), CAPTURE_TIMEOUT_MS);
    timeout.unref();
    request.on("socket", (socket) => socket.unref());
    request.on("close", () => clearTimeout(timeout));
    request.on("error", () => clearTimeout(timeout));
    request.end(body);
  } catch {
    return;
  }
}
