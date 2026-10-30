import { runCommand } from "./runCommand";

export const getVmStatus = async (name: string) => {
  const output = await runCommand("limactl", ["list", "--json"], {
    quiet: true,
  });

  const vms: { name: string; status: string }[] = output.startsWith("[")
    ? JSON.parse(output)
    : output
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

  return vms.find((vm) => vm.name === name)?.status;
};
