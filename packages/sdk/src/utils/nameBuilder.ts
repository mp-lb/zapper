/**
 * Centralized service name construction for native processes and Docker containers.
 * New runtime resources follow zap.{project}.{stackId}.{service}.
 * The legacy zap.{project}.{service} form remains readable for global cleanup.
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

export interface StackRuntimeIdentity {
  stackName: string;
  serviceName: string;
}

/**
 * Build the canonical identity used by every runtime backend for new
 * stack-scoped resources. Legacy unscoped names are intentionally supported
 * only by buildServiceName/parseServiceName for global discovery and cleanup.
 */
export function buildStackRuntimeIdentity(
  project: string,
  stackId: string | null | undefined,
  service: string,
): StackRuntimeIdentity {
  if (!stackId?.trim()) {
    throw new Error(
      `Cannot build runtime identity for ${project}.${service} without a stack ID`,
    );
  }

  const stackName = buildPrefix(project, stackId);
  return {
    stackName,
    serviceName: `${stackName}.${service}`,
  };
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
