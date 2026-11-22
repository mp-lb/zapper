import { describe, it, expect, vi, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import { getFoundationChanges } from "./getFoundationChanges";
import { assertFoundationReady } from "./assertFoundationReady";
import { getFoundationTargets } from "./getFoundationTargets";
import { planTerraform } from "./planTerraform";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: vi.fn(),
}));

const change = (address: string, actions: string[], mode = "managed") => ({
  address,
  mode,
  change: { actions, before: { secret: "never-report" } },
});

afterEach(() => vi.resetAllMocks());

describe("base infrastructure boundary", () => {
  it("detects the Berth upgrade's role additions and obsolete billing removal", () => {
    const changes = getFoundationChanges({
      resource_changes: [
        change("module.prj_ci.google_project_iam_member.deploy_run_admin", [
          "create",
        ]),
        change("module.prj_ci.google_project_iam_member.deploy_wif_viewer", [
          "create",
        ]),
        change("module.prj_ci.google_billing_account_iam_member.budgets[0]", [
          "delete",
        ]),
        change("module.svc_api.google_cloud_run_v2_service.main", ["update"]),
        change("module.prj_mongodb.mongodbatlas_database_user.main", [
          "update",
        ]),
      ],
    });

    expect(changes).toHaveLength(3);
    expect(() => assertFoundationReady(changes, "mp-lb/arcnet-base")).toThrow(
      /mp-lb\/arcnet-base/,
    );

    expect(JSON.stringify(changes)).not.toContain("never-report");
  });

  it("allows unchanged foundations and ignores refreshes", () => {
    const changes = getFoundationChanges({
      resource_changes: [
        change("module.prj_ci.google_project_iam_member.deploy_editor", [
          "no-op",
        ]),
        change("module.prj_budget.data.google_project.main", ["read"], "data"),
      ],
    });

    expect(() => assertFoundationReady(changes)).not.toThrow();
    expect(getFoundationChanges({})).toEqual([]);
  });

  it("protects replacements, removed modules and nested base resources", () => {
    expect(
      getFoundationChanges({
        resource_changes: [
          change("module.prj_gcp.google_project.main", ["delete", "create"]),
          change("module.prj_ci.module.nested.google_service_account.main", [
            "delete",
          ]),
        ],
      }),
    ).toHaveLength(2);

    expect(() => getFoundationChanges({ resource_changes: [{}] })).toThrow();
  });

  it("retains removed base module targets without including application infrastructure", () => {
    vi.spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 0,
      stdout:
        "module.prj_ci.google_service_account.deploy\nmodule.prj_budget.google_billing_budget.main\nmodule.prj_mongodb.user.main\n",
      stderr: "",
    } as never);

    expect(
      getFoundationTargets("/tmp", ["module.prj_gcp", "module.prj_mongodb"]),
    ).toEqual(["module.prj_gcp", "module.prj_ci", "module.prj_budget"]);
  });

  it("never treats a failed state read as an empty state", () => {
    vi.spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "403 forbidden",
    } as never);

    expect(() => getFoundationTargets("/tmp", [])).toThrow(/Cannot inspect/);
  });

  it("inspects a saved plan and refuses cross-boundary dependencies", () => {
    const spawn = vi
      .spyOn(childProcess, "spawnSync")
      .mockReturnValueOnce({ status: 0 } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          resource_changes: [
            change("module.svc_api.google_cloud_run_service.main", ["delete"]),
          ],
        }),
      } as never);

    expect(() => planTerraform("/private", ["module.prj_ci"])).toThrow(
      /application resources/,
    );

    expect(spawn.mock.calls[0][1]).toContain("-out=/private/reviewed.tfplan");
    expect(spawn.mock.calls.some(([, args]) => args?.[0] === "apply")).toBe(
      false,
    );
  });

  it("fails closed if Terraform cannot plan or inspect its plan", () => {
    const spawn = vi
      .spyOn(childProcess, "spawnSync")
      .mockReturnValue({ status: 1 } as never);

    expect(() => planTerraform("/private")).toThrow(/no apply was attempted/);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
