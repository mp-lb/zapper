import { renderer } from "../ui/renderer";

export function formatProfiles(profiles: string[]): string {
  return renderer.profiles.toText(profiles);
}

export function formatProfilesAsJson(profiles: string[]): string {
  return JSON.stringify(renderer.profiles.toJson(profiles));
}
