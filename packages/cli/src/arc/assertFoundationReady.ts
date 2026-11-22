import { getFoundationChanges } from "./getFoundationChanges";

export const assertFoundationReady = (
  changes: ReturnType<typeof getFoundationChanges>,
  command = "the administrator-managed base repository",
) => {
  if (changes.length === 0) return;

  throw new Error(
    [
      "An operator-managed infrastructure migration is required before deployment.",
      ...changes.map(
        ({ address, actions }) => `  ${actions.join("/")}: ${address}`,
      ),
      `Apply these changes locally from ${command} using an authorized administrator identity.`,
      "Transfer base resources to its separate Terraform state before removing their application configuration; never recreate existing resources.",
      "Then retry the ordinary deployment. Do not grant permanent IAM administrator access to CI.",
      "For Google project/billing IAM changes, the operator needs resourcemanager.projects.setIamPolicy / billing.accounts.setIamPolicy on the affected resources.",
      "Setting an ADC quota project does not grant these permissions or change GitHub's separate CI identity.",
    ].join("\n"),
  );
};
