# How to do a release

Step-by-step runbook for cutting releases of Zapper CLI.

## 🚨 CRITICAL REQUIREMENTS

**ALL VERIFICATION TASKS MUST PASS WITH EXIT CODE 0 - NO EXCEPTIONS**

- **ONLY EXIT CODE MATTERS** - warnings are completely acceptable
- Any **non-zero exit code** = **RELEASE BLOCKER** - CI will not run, nothing gets released
- **The release manager is responsible for fixing ALL exit code failures** - this is not negotiable
- Linting warnings, TypeScript warnings, build warnings = totally fine if exit code is 0

## Overview

Zapper CLI is published to npm as `zapper-cli`. We use [Changesets](https://github.com/changesets/changesets) for versioning and automated publishing via GitHub Actions.

## 1. Create release branch

```bash
git checkout -b release/$(date +%Y-%m-%d)
```

## 2. Fix any issues

If this machine has not run VM E2E before, set it up first:

```bash
bash ./etc/e2e_setup.sh
```

Run verification tasks in this specific order:

```bash
npm run build
npm run test:e2e
npm test
npm run lint:fix
```

**CRITICAL: ALL COMMANDS MUST RETURN EXIT CODE 0 (SUCCESS)**

- **WARNINGS ARE TOTALLY FINE** - only exit code matters, not warning count
- Any **non-zero exit code** = **RELEASE BLOCKER** - CI will not run, nothing gets released
- It is the **release manager's responsibility** to fix ALL exit code failures before proceeding
- This is not optional or a judgment call - exit code must be 0

Run commands in this order since:
1. Build failures cause test failures and other downstream issues
2. E2E tests verify the built CLI works end-to-end
3. Unit tests verify individual components
4. TypeScript is checked as part of build step
5. Lint fixes should be applied last to avoid introducing new issues

Common issues and fixes:
- **Build failures** (exit code ≠ 0): Usually TypeScript errors - fix the code
- **E2E test failures** (exit code ≠ 0): CLI integration broken - fix the functionality
- **Unit test failures** (exit code ≠ 0): Fix broken tests or update them if behavior changed
- **Lint failures** (exit code ≠ 0): Run `npm run lint:fix` to auto-fix, then manually fix remaining issues
- **Warnings are fine**: Build warnings, lint warnings, etc. don't block if exit code is 0

## 3. Add verify task (recommended)

Create a `zap.yaml` file in the project root to use Zapper's own task system for verification:

```yaml
project: zapper-release
tasks:
  verify:
    desc: Run all verification checks for release
    cmds:
      - npm run build
      - npm run test:e2e
      - npm test
      - npm run lint:fix
```

Then you can run:

```bash
zap task verify
```

This runs the full verification suite and **MUST PASS CLEANLY** with exit code 0. If this fails, go back to step 2 and fix the remaining issues.

Keep running `zap task verify` until it passes completely before proceeding.

## 4. Commit all outstanding work

```bash
git status
git add <files>
git commit -m "your message"
```

Make sure the working tree is clean before proceeding.

## 5. Create changeset and bump version

Create a changeset for your changes:

```bash
pnpm changeset
```

Follow the prompts to select the version bump type and describe the changes:

- `patch` for bug fixes (0.12.1 → 0.12.2)
- `minor` for new features (0.12.1 → 0.13.0)
- `major` for breaking changes (0.12.1 → 1.0.0)

Apply the changeset to update package.json version:

```bash
npm run version
# or: changeset version
```

Commit the version bumps:

```bash
git add .
git commit -m "Release: v$(node -p "require('./package.json').version")"
```

## 6. Final verification

Run the verification one more time to ensure version changes didn't break anything:

```bash
zap task verify
# or manually: npm run build && npm run test:e2e && npm test && npm run lint:fix
```

**This MUST pass cleanly.** If it fails, fix the issues and repeat until clean.

### 6.1 Documentation contradiction/staleness check (required)

Before pushing, verify docs still match current behavior, especially `zap.yaml` config docs.

Use quick grep checks:

```bash
rg -n "project|env_files|git_method|task_delimiters|whitelists|native|docker|tasks|homepage|links" src/config/schemas.ts
rg -n "project|env_files|git_method|task_delimiters|whitelists|native|docker|tasks|homepage|links" docs/usage.md
```

Then do a manual contradiction pass:

- If config semantics changed, confirm `docs/usage.md` examples and prose match current behavior.
- Check CLI command names/options in docs against current CLI implementation.
- Remove or correct stale statements and outdated examples.
- Treat unresolved doc contradictions as release blockers.

## 7. Push to main (triggers automated release)

Push directly to main (no PR needed for releases):

```bash
git push origin release/$(date +%Y-%m-%d):main
```

This triggers the GitHub Actions workflow which will:
1. Run verification checks
2. Create a "Version Packages" PR (if there are changesets)
3. Automatically publish to npm when the Version Packages PR is merged

Immediately monitor the push with GitHub CLI:

```bash
gh run list --branch main --limit 5
gh run watch <run-id> --exit-status
```

If the run fails, treat it as a release blocker, fix the issue, and push again.

## 8. Merge back to local main

```bash
git checkout main
git pull
git branch -d release/$(date +%Y-%m-%d)  # Clean up release branch
```

## 9. Handle the Version Packages PR

1. Go to GitHub and find the "Version Packages" PR created by the Changesets action
2. Review the PR to ensure version numbers and changelog look correct
3. Merge the PR to trigger automatic npm publishing

## 10. Verify the release

Check npm directly with npm CLI:

```bash
npm view zapper-cli version
```

Confirm this matches your just-released version from `package.json`.

Then test the published package:

```bash
npm install -g zapper-cli@latest
zap --version
zap --help
```

Check npm to verify the new version was published: https://www.npmjs.com/package/zapper-cli

## Wait and Recheck After Push

**Important:** The release process has many steps and it's very easy to make mistakes. After pushing to main, always wait and verify everything worked correctly.

**Recommended workflow:**
1. Push to main
2. Wait 3 minutes:
   ```bash
   sleep 180
   ```
3. Recheck the status:
   - Use GitHub CLI to verify the workflow completed successfully:
     ```bash
     gh run list --branch main --limit 5
     gh run watch <run-id> --exit-status
     ```
   - Check that the Version Packages PR was created correctly (if changesets are pending):
     ```bash
     gh pr list --state open --limit 20
     ```
   - Verify no CI failures occurred
4. After release is complete and npm shows the new version, wait 5 more minutes and verify npm again:
   ```bash
   sleep 300
   npm view zapper-cli version
   ```
   This confirms the published version is still resolvable via npm registry APIs.

**Common mistakes to watch for:**
- Forgetting to create or commit the changeset file
- Not committing all changes before pushing
- Pushing to the wrong branch
- Skipping the final verification step

**If something didn't work:** Most of the time, we did something wrong in the process above. Double-check each step and fix any mistakes before re-pushing.

## Manual Release (emergency only)

If the automated process fails, you can publish manually:

```bash
npm run build       # Ensure latest build
npm publish         # Publish to npm
```

**Note:** Only use this if GitHub Actions is broken. The automated process is preferred.

## Troubleshooting

**If verification tasks fail (Step 2):**
- **EXIT CODE MUST BE 0** - Any non-zero exit code blocks the release completely
- **NO EXCEPTIONS** - CI will not run if verification fails
- **Release manager must fix ALL failures** before proceeding
- If `zap task verify` or manual commands still fail after individual fixes, repeat step 2 until clean

**If GitHub Actions fails:**
- Check the workflow logs for specific errors
- Common issues: Node.js version, dependency installation, test timeouts
- Fix the underlying issue and push again

**If npm publish fails:**
- Check if you're authenticated: `npm whoami`
- Verify package.json has correct name and version
- Ensure no duplicate version exists on npm
- Check if there are publishing restrictions

**If the Version Packages PR doesn't appear:**
- Verify you committed changeset files (should be in `.changeset/` directory)
- Check if changesets action is properly configured in `.github/workflows/`
- Wait a few minutes - the PR creation can take time
