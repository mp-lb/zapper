import type { ReactNode } from "react";
import type {
  ProjectLinkResult,
  ServiceActionReport,
  StatusResult,
} from "@mp-lb/zapper-sdk";

export type ZapperAction = "up" | "down" | "restart";

export interface ZapperProjectQuery {
  dir: string;
  profile?: string;
}

export interface ZapperServiceCounts {
  total: number;
  up: number;
  pending: number;
  down: number;
  native: number;
  docker: number;
}

export interface ZapperProfileState {
  configured: string[];
  current?: string;
  selected?: string;
  override?: string;
}

export interface ZapperProjectSnapshot {
  projectName?: string;
  projectRoot?: string;
  homepage?: string;
  links: ProjectLinkResult[];
  status: StatusResult;
  counts: ZapperServiceCounts;
  profiles: ZapperProfileState;
  refreshedAt: string;
}

export interface ZapperProjectActionResult {
  action: ZapperAction | "profile.select" | "profile.reset";
  report?: ServiceActionReport;
  snapshot: ZapperProjectSnapshot;
}

export interface ZapperProjectClient {
  getProject(query: ZapperProjectQuery): Promise<ZapperProjectSnapshot>;
  up(query: ZapperProjectQuery): Promise<ZapperProjectActionResult>;
  down(query: ZapperProjectQuery): Promise<ZapperProjectActionResult>;
  restart(query: ZapperProjectQuery): Promise<ZapperProjectActionResult>;
  selectProfile(
    query: ZapperProjectQuery,
    profile: string,
  ): Promise<ZapperProjectActionResult>;
  resetProfile(query: ZapperProjectQuery): Promise<ZapperProjectActionResult>;
}

export interface ZapperProviderProps {
  client: ZapperProjectClient;
  children: ReactNode;
}

export interface UseZapperProjectOptions extends ZapperProjectQuery {
  client?: ZapperProjectClient;
  enabled?: boolean;
}

export interface UseZapperProjectResult {
  data?: ZapperProjectSnapshot;
  status?: StatusResult;
  counts?: ZapperServiceCounts;
  links: ProjectLinkResult[];
  homepage?: string;
  profiles: string[];
  profile?: string;
  selectedProfile?: string;
  loading: boolean;
  refreshing: boolean;
  settling: boolean;
  error?: Error;
  pendingAction?: ZapperAction | "profile.select" | "profile.reset";
  refresh: () => Promise<ZapperProjectSnapshot | undefined>;
  up: () => Promise<ZapperProjectActionResult>;
  down: () => Promise<ZapperProjectActionResult>;
  restart: () => Promise<ZapperProjectActionResult>;
  setProfile: (profile: string) => Promise<ZapperProjectActionResult>;
  resetProfile: () => Promise<ZapperProjectActionResult>;
}
