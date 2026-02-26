/**
 * Centralized service name construction for PM2 processes and Docker containers.
 * All names follow the pattern: zap.{project}.{service}
 * or with an instance: zap.{project}.{instanceId}.{service}
 */

export function buildServiceName(
  project: string,
  service: string,
  instanceId?: string | null,
): string {
  return instanceId
    ? `zap.${project}.${instanceId}.${service}`
    : `zap.${project}.${service}`;
}

export function buildPrefix(
  project: string,
  instanceId?: string | null,
): string {
  return instanceId ? `zap.${project}.${instanceId}` : `zap.${project}`;
}

export interface ParsedServiceName {
  project: string;
  instanceId?: string;
  service: string;
}

export function parseServiceName(
  prefixedName: string,
): ParsedServiceName | null {
  const parts = prefixedName.split(".");
  if (parts[0] !== "zap" || parts.length < 3 || parts.length > 4) return null;
  if (parts.length === 4) {
    return { project: parts[1], instanceId: parts[2], service: parts[3] };
  }
  return { project: parts[1], service: parts[2] };
}
