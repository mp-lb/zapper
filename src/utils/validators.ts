export function isValidName(name: string): boolean {
  if (typeof name !== "string") return false;
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(name);
}

export function assertValidName(name: string, context: string): void {
  if (!isValidName(name)) {
    throw new Error(
      `${context} name '${name}' is invalid. Must start with a letter and contain only letters, digits, and hyphens`,
    );
  }
}
