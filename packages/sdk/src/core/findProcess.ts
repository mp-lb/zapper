import { ZapperConfig, Process } from "../config/schemas";

export const findProcess = (
  config: ZapperConfig,
  name: string,
): Process | undefined => {
  const native = config.native?.[name];
  if (native) return native;
  return undefined;
};
