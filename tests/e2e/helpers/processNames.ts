export interface ParsedProjectProcessName {
  instanceId?: string;
  service: string;
}

export function parseProjectProcessName(
  name: string | undefined,
  projectName: string,
): ParsedProjectProcessName | null {
  if (!name) return null;

  const parts = name.split(".");
  if (parts[0] !== "zap" || parts[1] !== projectName) {
    return null;
  }

  if (parts.length === 3) {
    return { service: parts[2] };
  }

  if (parts.length === 4 && parts[2]) {
    return {
      instanceId: parts[2],
      service: parts[3],
    };
  }

  return null;
}

export function isProjectProcessName(
  name: string | undefined,
  projectName: string,
): boolean {
  return parseProjectProcessName(name, projectName) !== null;
}

export function hasProjectServiceProcess(
  name: string | undefined,
  projectName: string,
  service: string,
): boolean {
  return parseProjectProcessName(name, projectName)?.service === service;
}
