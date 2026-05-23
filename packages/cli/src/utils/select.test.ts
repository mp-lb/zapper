import { describe, expect, it } from "vitest";
import { toEnquirerChoices } from "./select";

describe("toEnquirerChoices", () => {
  it("maps select options to stable enquirer choice ids", () => {
    expect(
      toEnquirerChoices([
        { label: "Home", description: "http://localhost:3000", value: "home" },
        { label: "Docs", description: "http://localhost:3001", value: "docs" },
      ]),
    ).toEqual([
      {
        name: "0",
        message: "Home",
        hint: "http://localhost:3000",
      },
      {
        name: "1",
        message: "Docs",
        hint: "http://localhost:3001",
      },
    ]);
  });
});
