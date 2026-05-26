import readline from "readline";
import { renderer } from "../ui/renderer";
import { PromptCancelledError } from "../errors";

export async function confirm(
  message: string,
  options: { defaultYes?: boolean; force?: boolean } = {},
): Promise<boolean> {
  if (options.force) return true;

  const g = globalThis as unknown as {
    process?: { stdin?: unknown; stdout?: unknown };
  };

  const rl = readline.createInterface({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: (g.process?.stdin as any) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output: (g.process?.stdout as any) || undefined,
  });

  const answer: string = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      reject(new PromptCancelledError());
    };

    rl.once("SIGINT", cancel);
    rl.question(
      renderer.confirm.promptText(message, options.defaultYes),
      (ans) => finish(ans.trim()),
    );
  }).finally(() => {
    rl.close();
  });

  if (!answer) return !!options.defaultYes;
  const normalized = answer.toLowerCase();
  if (["y", "yes"].includes(normalized)) return true;
  if (["n", "no"].includes(normalized)) return false;
  return !!options.defaultYes;
}
