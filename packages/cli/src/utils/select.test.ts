import { describe, expect, it, vi } from "vitest";
import Enquirer from "enquirer";
import { PromptCancelledError } from "../errors";
import { select, toEnquirerChoices } from "./select";

vi.mock("enquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

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

  it("turns prompt cancellation into a shared cancellation error", async () => {
    vi.mocked(Enquirer.prompt).mockRejectedValueOnce("");

    await expect(
      select("Pick one", [{ label: "Home", value: "home" }]),
    ).rejects.toBeInstanceOf(PromptCancelledError);
  });

  it("treats readline use-after-close as prompt cancellation", async () => {
    const error = Object.assign(new Error("readline was closed"), {
      code: "ERR_USE_AFTER_CLOSE",
    });
    vi.mocked(Enquirer.prompt).mockRejectedValueOnce(error);

    await expect(
      select("Pick one", [{ label: "Home", value: "home" }]),
    ).rejects.toBeInstanceOf(PromptCancelledError);
  });
});
