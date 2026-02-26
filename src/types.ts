export type ServiceType = "native" | "docker";
export type ActionType = "start" | "stop";

export interface Action {
  type: ActionType;
  serviceType: ServiceType;
  name: string;
  healthcheck: number | string;
}

export interface ExecutionWave {
  actions: Action[];
}

export interface ActionPlan {
  waves: ExecutionWave[];
}
