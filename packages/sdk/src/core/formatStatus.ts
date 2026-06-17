import { StatusResult } from "./getStatus";
import { Context } from "../types/Context";
import { renderer } from "../ui/renderer";

export function formatStatus(
  statusResult: StatusResult,
  context?: Context,
): string {
  return renderer.status.toText(statusResult, context);
}

export function formatStatusAsJson(statusResult: StatusResult): string {
  return JSON.stringify(renderer.status.toJson(statusResult));
}
