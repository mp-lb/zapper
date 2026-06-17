import type { StatusResult } from "@mp-lb/zapper-sdk";
import type { ZapperServiceCounts } from "./types";

export function countServices(status: StatusResult): ZapperServiceCounts {
  const services = [...status.native, ...status.docker];

  return {
    total: services.length,
    up: services.filter((service) => service.status === "up").length,
    pending: services.filter((service) => service.status === "pending").length,
    down: services.filter((service) => service.status === "down").length,
    native: status.native.length,
    docker: status.docker.length,
  };
}
