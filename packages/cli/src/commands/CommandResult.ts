import { StoredVolume, ZapperState } from "../config/schemas";
import { ServiceDockerVolume } from "../config/volumeManager";
import { StatusResult } from "../core/getStatus";
import { ServiceListResult } from "../core/getServiceList";
import type {
  SystemProjectStatus,
  SystemResourceAuditEntry,
  SystemResourceAuditResult,
  SystemRegistryProject,
} from "../system";
import type {
  ServiceActionName,
  ServiceActionReport,
  ServiceExecutionReport,
} from "../types";
import { Context, Task } from "../types/Context";
import type { RuntimeServiceInfo } from "./RuntimeCommand";
import type { StackInfo } from "./StackCommand";

export interface ProjectLinkResult {
  name: string;
  url: string;
  isHomepage: boolean;
}

export interface ProfileHotSwapReport {
  started: ServiceExecutionReport;
  stopped?: ServiceExecutionReport;
  cleanupCandidates: string[];
  cleanupSkipped: string[];
}

export type CommandResult =
  | {
      kind: "status";
      statusResult: StatusResult;
      context?: Context;
    }
  | {
      kind: "list";
      listResult: ServiceListResult;
      context: Context;
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
      kind: "profiles.current";
      profile?: string;
      selectedProfile?: string;
      overrideProfile?: string;
    }
  | {
      kind: "profiles.selected";
      profile: string;
      previousProfile?: string;
      hotSwap?: ProfileHotSwapReport;
    }
  | {
      kind: "profiles.reset";
      profile: string;
      previousProfile?: string;
      hotSwap?: ProfileHotSwapReport;
    }
  | {
      kind: "env.service";
      resolvedEnv: Record<string, string>;
    }
  | {
      kind: "runtime";
      project: {
        provider: string;
        shell?: string;
        tools: Record<string, string>;
        source?: string;
        warning?: string;
      };
      services: RuntimeServiceInfo[];
    }
  | {
      kind: "state";
      state: ZapperState;
    }
  | {
      kind: "stack.id";
      stackId: string;
      profile: string;
    }
  | {
      kind: "stack.current";
      stack: StackInfo;
    }
  | {
      kind: "stack.list";
      stacks: StackInfo[];
    }
  | {
      kind: "config";
      filteredConfig: unknown;
      pretty: boolean;
    }
  | {
      kind: "validate";
      valid: boolean;
      configPath: string | null;
      error?: {
        name: string;
        message: string;
        issues?: string[];
        zodIssues?: unknown[];
      };
    }
  | {
      kind: "services.action";
      action: ServiceActionName;
      services?: string[];
      report: ServiceActionReport;
    }
  | {
      kind: "clone.completed";
      services?: string[];
      report: {
        status: "success";
        action: "clone";
        services?: string[];
      };
    }
  | {
      kind: "reset";
      status: "aborted" | "completed";
      report: {
        status: "aborted" | "completed";
        action: "reset";
      };
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
      report: {
        status: "success";
        action: "launch";
        opened: {
          status: "success";
          url: string;
        };
      };
    }
  | {
      kind: "links.list";
      links: ProjectLinkResult[];
    }
  | {
      kind: "home.value";
      value: string;
    }
  | {
      kind: "notes.value";
      value: string;
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
      kind: "global.list";
      allProjects?: boolean;
      projects: Array<{
        name: string;
        prefix: string;
        pm2: string[];
        containers: string[];
      }>;
      // Processes running Zapper work but unknown to PM2 (daemon-kill
      // survivors): wrapper processes or listeners on zap-assigned ports.
      orphans: Array<{
        name: string;
        pid: number;
        location: string;
        reason: string;
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
    }
  | {
      kind: "global.prune";
      status: "aborted" | "completed";
      staleProjects: SystemRegistryProject[];
      removedProjects: SystemRegistryProject[];
      resources: SystemResourceAuditEntry[];
    }
  | {
      kind: "system.projects";
      projects: SystemProjectStatus[];
    }
  | {
      kind: "system.registry.prune";
      removed: SystemRegistryProject[];
    }
  | {
      kind: "system.registry.forget";
      removed: SystemRegistryProject | null;
    }
  | {
      kind: "system.registry.repair";
      removed: SystemRegistryProject[];
      projects: SystemProjectStatus[];
    }
  | {
      kind: "system.resources.audit";
      audit: SystemResourceAuditResult;
    }
  | {
      kind: "system.resources.cleanup";
      status: "aborted" | "completed";
      cleanup: SystemResourceAuditResult;
    }
  | {
      kind: "init";
      isolated: boolean;
      instanceKey: string;
      instanceId?: string;
      ports: Record<string, string>;
      path: string;
      randomized: boolean;
      warningShown: boolean;
    }
  | {
      kind: "instance.label";
      instanceKey: string;
      instanceId: string;
      label?: string;
      displayLabel: string;
      updated: boolean;
    }
  | {
      kind: "volume.reset";
      instanceKey: string;
      volumes: Record<string, StoredVolume>;
    }
  | {
      kind: "volume.prune";
      status: "aborted" | "completed";
      instanceKey: string;
      volumes: Record<string, StoredVolume>;
    }
  | {
      kind: "volume.list";
      instanceKey: string;
      service: string;
      managedOnly: boolean;
      idOnly: boolean;
      volumes: ServiceDockerVolume[];
    };
