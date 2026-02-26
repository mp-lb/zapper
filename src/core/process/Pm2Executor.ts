import { Process } from "../../config/schemas";
import { Pm2Manager } from "./Pm2Manager";

export class Pm2Executor {
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
    await Pm2Manager.startProcessWithTempEcosystem(
      projectName,
      process,
      this.configDir,
      this.instanceId,
    );
  }

  async stopProcess(processName: string): Promise<void> {
    await Pm2Manager.deleteAllMatchingProcesses(
      processName,
      this.projectName,
      this.configDir,
      this.instanceId,
    );
  }

  async restartProcess(processName: string): Promise<void> {
    await Pm2Manager.restartProcess(
      processName,
      this.projectName,
      this.instanceId,
    );
  }

  async showLogs(processName: string, follow: boolean = false): Promise<void> {
    await Pm2Manager.showLogs(
      processName,
      this.projectName,
      follow,
      this.configDir,
      this.instanceId,
    );
  }
}
