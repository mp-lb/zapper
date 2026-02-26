import { Task } from "../types/Context";
import { renderer } from "../ui/renderer";
export type {
  TaskListItem,
  TaskParamInfo,
  TaskParamsOutput,
} from "../ui/renderer";

export function formatTasks(tasks: Task[]): string {
  return renderer.tasks.toText(tasks);
}

export function formatTasksAsJson(tasks: Task[]): string {
  return JSON.stringify(renderer.tasks.toJson(tasks));
}

export function formatTaskParamsAsJson(
  task: Task,
  delimiters?: [string, string],
): string {
  return JSON.stringify(renderer.tasks.paramsToJson(task, delimiters));
}
