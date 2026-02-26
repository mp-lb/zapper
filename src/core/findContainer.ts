import { ZapperConfig, Container } from "../config/schemas";

export const findContainer = (
  config: ZapperConfig,
  name: string,
): [string, Container] | undefined => {
  const docker = config.docker || config.containers;
  if (!docker) return undefined;
  const container = docker[name];
  if (!container) return undefined;
  return [name, container];
};
