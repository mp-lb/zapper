import Enquirer from "enquirer";

const ansi = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  green: "\u001B[32m",
} as const;

export interface SelectOption<T> {
  label: string;
  description?: string;
  value: T;
}

interface EnquirerChoice {
  name: string;
  message: string;
  hint?: string;
}

interface SelectAnswer {
  selected: string;
}

function active(text: string): string {
  return `${ansi.green}${ansi.bold}${text}${ansi.reset}`;
}

export function toEnquirerChoices<T>(
  options: SelectOption<T>[],
): EnquirerChoice[] {
  return options.map((option, index) => ({
    name: String(index),
    message: option.label,
    hint: option.description,
  }));
}

export async function select<T>(
  message: string,
  options: SelectOption<T>[],
): Promise<T> {
  if (options.length === 0) {
    throw new Error("Select prompt requires at least one option");
  }

  const answers = await Enquirer.prompt<SelectAnswer>({
    type: "select",
    name: "selected",
    message,
    choices: toEnquirerChoices(options),
    hint: "Use ↑/↓ to move, Enter to open",
    symbols: {
      pointer: "›",
    },
    styles: {
      primary: active,
      em: active,
    },
  } as Parameters<typeof Enquirer.prompt<SelectAnswer>>[0]);

  const selectedIndex = Number(answers.selected);
  const selectedOption = options[selectedIndex];
  if (!selectedOption) {
    throw new Error("No link selected.");
  }

  return selectedOption.value;
}
