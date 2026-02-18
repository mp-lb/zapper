import { ZapperState } from "../config/schemas";
import { StatusResult } from "../core/getStatus";
import { Context, Task } from "../types/Context";

export type CommandResult =
  | {
      kind: "status";
      statusResult: StatusResult;
      context?: Context;
    }
  | {
      kind: "tasks.list";
      tasks: Task[];
    }
  | {
      kind: "tasks.params";
      task: Task;
      delimiters?: [string, string];
    }
  | {
      kind: "profiles.list";
      profiles: string[];
    }
  | {
      kind: "environments.list";
      environments: string[];
    }
  | {
      kind: "env.service";
      resolvedEnv: Record<string, string>;
    }
  | {
      kind: "state";
      state: ZapperState;
    }
  | {
      kind: "config";
      filteredConfig: unknown;
      pretty: boolean;
    }
  | {
      kind: "isolation.enabled";
      instanceId: string;
    }
  | {
      kind: "services.action";
      action: "up" | "down" | "restart";
      services?: string[];
    }
  | {
      kind: "clone.completed";
      services?: string[];
    }
  | {
      kind: "reset";
      status: "aborted" | "completed";
    }
  | {
      kind: "kill";
      status: "aborted" | "completed";
      projectName: string;
      prefix: string;
      pm2: string[];
      containers: string[];
    }
  | {
      kind: "launch.opened";
      url: string;
    }
  | {
      kind: "git.checkout.completed";
      branch: string;
    }
  | {
      kind: "git.pull.completed";
    }
  | {
      kind: "git.status.completed";
    }
  | {
      kind: "git.stash.completed";
    }
  | {
      kind: "profiles.picker";
      profiles: string[];
      activeProfile?: string;
    }
  | {
      kind: "profiles.enabled";
      profile: string;
      startedServices: string[];
    }
  | {
      kind: "profiles.disabled";
      activeProfile?: string;
    }
  | {
      kind: "environments.picker";
      environments: string[];
      activeEnvironment?: string;
    }
  | {
      kind: "environments.enabled";
      environment: string;
    }
  | {
      kind: "environments.disabled";
      activeEnvironment?: string;
    }
  | {
      kind: "global.list";
      allProjects?: boolean;
      projects: Array<{
        name: string;
        prefix: string;
        pm2: string[];
        containers: string[];
      }>;
    }
  | {
      kind: "global.kill";
      status: "aborted" | "completed";
      allProjects: boolean;
      projects: Array<{
        name: string;
        prefix: string;
        pm2: string[];
        containers: string[];
      }>;
    };
