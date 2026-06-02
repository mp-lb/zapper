export type DockerCommand = string | string[];

export function parseDockerCommandString(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (escaped) {
    current += "\\";
  }

  if (quote) {
    throw new Error("Docker command contains an unterminated quote");
  }

  if (current) {
    args.push(current);
  }

  return args;
}

export function dockerCommandToArgs(command?: DockerCommand): string[] {
  if (!command) return [];
  if (Array.isArray(command)) return command;
  return parseDockerCommandString(command);
}

function quoteCommandArg(arg: string): string {
  if (!arg) return "''";
  if (!/[\s'"\\]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function formatDockerCommand(command: DockerCommand): string {
  if (Array.isArray(command)) {
    return command.map(quoteCommandArg).join(" ");
  }

  return command;
}
