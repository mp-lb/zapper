import { describe, expect, it } from "vitest";
import { dockerCommandToArgs, parseDockerCommandString } from "./dockerCommand";

describe("parseDockerCommandString", () => {
  it("splits simple command strings into argv", () => {
    expect(parseDockerCommandString("postgres -c log_statement=all")).toEqual([
      "postgres",
      "-c",
      "log_statement=all",
    ]);
  });

  it("preserves quoted arguments", () => {
    expect(parseDockerCommandString('sh -c "echo hello world"')).toEqual([
      "sh",
      "-c",
      "echo hello world",
    ]);
  });

  it("passes array commands through unchanged", () => {
    const command = ["postgres", "-c", "log_statement=all"];
    expect(dockerCommandToArgs(command)).toBe(command);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseDockerCommandString('sh -c "echo hello')).toThrow(
      "Docker command contains an unterminated quote",
    );
  });
});
