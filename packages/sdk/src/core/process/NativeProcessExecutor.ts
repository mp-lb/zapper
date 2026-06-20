import { Process } from "../../config/schemas";
import { NativeProcessManager } from "./NativeProcessManager";

export class NativeProcessExecutor {
  private projectName?: string;
  private configDir?: string;
  private instanceId?: string | null;

  constructor(
    projectName?: string,
    configDir?: string,
    instanceId?: string | null,
  ) {
    this.projectName = projectName;
    this.configDir = configDir;
    this.instanceId = instanceId;
  }

  async startProcess(process: Process, projectName: string): Promise<void> {
    await NativeProcessManager.startProcessWithTempEcosystem(
      projectName,
      process,
      this.configDir,
      this.instanceId,
    );
  }

  async stopProcess(processName: string): Promise<void> {
    await NativeProcessManager.deleteAllMatchingProcesses(
      processName,
      this.projectName,
      this.configDir,
      this.instanceId,
    );
  }

  async restartProcess(processName: string): Promise<void> {
    await NativeProcessManager.restartProcess(
      processName,
      this.projectName,
      this.instanceId,
    );
  }

  async showLogs(processName: string, follow: boolean = false): Promise<void> {
    await NativeProcessManager.showLogs(
      processName,
      this.projectName,
      follow,
      this.configDir,
      this.instanceId,
    );
  }
}
