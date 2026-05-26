export type ServiceType = "native" | "docker";
export type ActionType = "start" | "stop";
export type Healthcheck =
  | number
  | string
  | {
      type: "delay";
      seconds: number;
    }
  | {
      type: "http";
      url: string;
      timeout?: number;
      interval?: number;
    };

export interface Action {
  type: ActionType;
  serviceType: ServiceType;
  name: string;
  healthcheck?: Healthcheck;
}

export interface ExecutionWave {
  actions: Action[];
}

export interface ActionPlan {
  waves: ExecutionWave[];
}

export type ServiceActionName = "up" | "down" | "restart";

export interface ServiceExecutionReport {
  started: string[];
  stopped: string[];
  failed: string[];
}

export type ServiceActionEvent =
  | {
      type: "services.wave";
      start: string[];
      stop: string[];
    }
  | {
      type: "services.wave.completed";
      started: string[];
      stopped: string[];
    }
  | {
      type: "service.healthcheck.timeout";
      service: string;
      healthcheck: string;
    };

export interface ServiceActionReporter {
  onEvent(event: ServiceActionEvent): void;
}

export type ServiceActionOpenReport =
  | {
      status: "success";
      url: string;
    }
  | {
      status: "skipped";
      reason: string;
    };

export interface ServiceActionReport extends ServiceExecutionReport {
  status: "success";
  action: ServiceActionName;
  services?: string[];
  opened?: ServiceActionOpenReport;
}
