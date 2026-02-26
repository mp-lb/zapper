import { renderer } from "../ui/renderer";

export function formatEnvironments(environments: string[]): string {
  return renderer.environments.toText(environments);
}

export function formatEnvironmentsAsJson(environments: string[]): string {
  return JSON.stringify(renderer.environments.toJson(environments));
}
