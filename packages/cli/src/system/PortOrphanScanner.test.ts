import { describe, expect, it } from "vitest";
import { parseLsofListeners } from "./PortOrphanScanner";
import { parseParentMap, pidBelongsToTree } from "./processTree";

describe("parseLsofListeners", () => {
  it("parses lsof -F pcn field output into pid/command/port listeners", () => {
    const output = [
      "p606",
      "crapportd",
      "f14",
      "n*:52791",
      "f15",
      "n*:52791",
      "p1234",
      "cnode",
      "f20",
      "n127.0.0.1:50001",
      "f21",
      "n[::1]:50002",
    ].join("\n");

    expect(parseLsofListeners(output)).toEqual([
      { pid: 606, command: "rapportd", port: 52791 },
      { pid: 1234, command: "node", port: 50001 },
      { pid: 1234, command: "node", port: 50002 },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseLsofListeners("")).toEqual([]);
  });
});

describe("parseParentMap", () => {
  it("parses ps pid/ppid pairs", () => {
    const parents = parseParentMap("    1     0\n  500     1\n  501   500\n");
    expect(parents.get(501)).toBe(500);
    expect(parents.get(500)).toBe(1);
  });
});

describe("pidBelongsToTree", () => {
  const parents = new Map([
    [501, 500],
    [500, 400],
    [400, 1],
    [900, 1],
  ]);

  it("finds the pid itself in the roots", () => {
    expect(pidBelongsToTree(500, new Set([500]), parents)).toBe(true);
  });

  it("finds an ancestor in the roots", () => {
    expect(pidBelongsToTree(501, new Set([400]), parents)).toBe(true);
  });

  it("rejects a pid with no flagged ancestor", () => {
    expect(pidBelongsToTree(900, new Set([400]), parents)).toBe(false);
  });

  it("survives a cycle in the parent map", () => {
    const cyclic = new Map([
      [10, 20],
      [20, 10],
    ]);

    expect(pidBelongsToTree(10, new Set([99]), cyclic)).toBe(false);
  });
});
