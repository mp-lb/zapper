# How to do a release

Step-by-step runbook for cutting releases of Zapper CLI.

## 🚨 CRITICAL REQUIREMENTS

**ALL VERIFICATION TASKS MUST PASS WITH EXIT CODE 0 - NO EXCEPTIONS**

- **ONLY EXIT CODE MATTERS** - warnings are completely acceptable
- Any **non-zero exit code** = **RELEASE BLOCKER** - CI will not run, nothing gets released
- **The release manager is responsible for fixing ALL exit code failures** - this is not negotiable
- Linting warnings, TypeScript warnings, build warnings = totally fine if exit code is 0

## Overview

Zapper CLI is published to npm as `@mp-lb/zapper` from `packages/cli`. We use [Changesets](https://github.com/changesets/changesets) for versioning and automated publishing via GitHub Actions.

The native macOS menu bar app is built separately by `.github/workflows/macos-release.yml`.
That workflow runs on `v*` tags or manual dispatch, installs Node and pnpm,
builds the CLI, builds `apps/macos` with a bundled Node/CLI/PM2 runtime, zips
`Zapper.app`, and uploads both a versioned zip and stable `Zapper-macOS.zip`
asset to the matching GitHub Release.

macOS release builds use the same desktop signing environment names as the
Electron apps in nearby MAP Lab repos. CI loads `.env.production` first, then
decrypts `proj/secrets.txt.enc` with the GitHub Actions `SECRETS_KEY` secret.

Put non-secret desktop release values in `.env.production`:

- `APPLE_ID`
- `APPLE_TEAM_ID`
- `CSC_LINK`: base64-encoded Developer ID Application `.p12`, a supported
  `data:...;base64,...` value, an HTTPS URL, or a local file path.

Put secret release values in `proj/secrets.txt.enc`:

- `NPM_TOKEN`
- `CSC_KEY_PASSWORD`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `DESKTOP_RELEASES_GITHUB_TOKEN`

GitHub Actions only needs `SECRETS_KEY` for these project-specific secrets.

## Release Auth Prerequisite

Before attempting a release, make sure npm token auth is configured correctly
for CI.

- Required: `NPM_TOKEN` in `proj/secrets.txt.enc` with publish access to
  `@mp-lb/zapper`.
- Required: GitHub Actions repository secret `SECRETS_KEY` so the release
  workflow can decrypt `proj/secrets.txt.enc`.

Important details:

- Use a granular npm access token scoped as narrowly as possible while still
  allowing publish for `@mp-lb/zapper`.
- Keep token expiry/rotation documented outside the repo.
- The release workflow passes `NPM_TOKEN` as both `NPM_TOKEN` and
  `NODE_AUTH_TOKEN` for npm/Changesets compatibility after decrypting
  `proj/secrets.txt.enc`.

## 1. Create release branch

```bash
git checkout -b release/$(date +%Y-%m-%d)
```

## 2. Fix any issues

If this machine has not run VM E2E before, set it up first:

```bash
bash ./packages/cli/etc/e2e_setup.sh
```

Run verification tasks in this specific order:

```bash
pnpm build
pnpm test:e2e
pnpm test
pnpm lint:fix
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
4. TypeScript and the VitePress docs site are checked as part of the build step
5. Lint fixes should be applied last to avoid introducing new issues

Common issues and fixes:
- **Build failures** (exit code ≠ 0): Usually TypeScript errors - fix the code
- **E2E test failures** (exit code ≠ 0): CLI integration broken - fix the functionality
- **Unit test failures** (exit code ≠ 0): Fix broken tests or update them if behavior changed
- **Lint failures** (exit code ≠ 0): Run `pnpm lint:fix` to auto-fix, then manually fix remaining issues
- **Warnings are fine**: Build warnings, lint warnings, etc. don't block if exit code is 0

## 3. Repeat verification

Keep running the manual verification commands from step 2 until they all pass
with exit code 0. Do not commit a root `zap.yaml` helper for release
verification; this repository's unit tests include no-config discovery cases
that expect the repo root not to contain a Zapper config.

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
pnpm version
# or: changeset version
```

Commit the version bumps:

```bash
git add .
git commit -m "Release: v$(node -p "require('./packages/cli/package.json').version")"
```

## 6. Final verification

Run the verification one more time to ensure version changes didn't break anything:

```bash
pnpm build && pnpm test:e2e && pnpm test && pnpm lint:fix
```

**This MUST pass cleanly.** If it fails, fix the issues and repeat until clean.

### 6.1 Documentation contradiction/staleness check (required)

Before pushing, verify docs still match current behavior, especially `zap.yaml` config docs. The Markdown files in `docs/` are the docs source; VitePress builds the web docs from them and generates `/llms.txt` plus `/llms-full.txt` for raw agent access.

Use quick grep checks:

```bash
rg -n "project|env|env_files|git_method|task_delimiters|native|docker|tasks|homepage|notes|links" packages/cli/src/config/schemas.ts
rg -n "project|env|env_files|git_method|task_delimiters|native|docker|tasks|homepage|notes|links" docs/configuration.md docs/services.md docs/tasks.md docs/project-metadata.md
```

Then do a manual contradiction pass:

- If config semantics changed, confirm the docs website reference pages match current behavior.
- Check CLI command names/options in docs against current CLI implementation.
- Run `pnpm docs:build` if you changed documentation structure or need to verify the raw generated docs bundle directly.
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
3. Automatically publish to npm when the Version Packages PR is merged using the `NPM_TOKEN` value from `proj/secrets.txt.enc`

Immediately monitor the push with GitHub CLI:

```bash
gh run list --branch main --limit 5
gh run watch <run-id> --exit-status
```

If the run fails, treat it as a release blocker, fix the issue, and push again.

## 8. Merge back to local main

After pushing, immediately return the local checkout to `main` and fast-forward it
to the commit that was just pushed. This keeps local release follow-up work on the
same branch/state as CI, even if the workflow later fails and needs debugging.

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
npm view @mp-lb/zapper version
```

Confirm this matches your just-released version from `packages/cli/package.json`.

Then test the published package:

```bash
npm install -g @mp-lb/zapper@latest
zap --version
zap --help
```

Check npm to verify the new version was published: https://www.npmjs.com/package/@mp-lb/zapper

## 11. Publish macOS app asset

After the release version is final, push a matching `v*` tag to build and attach
the macOS app to a GitHub Release:

```bash
version="$(node -p "require('./packages/cli/package.json').version")"
git tag "v${version}"
git push origin "v${version}"
```

Monitor the `macOS App Release` workflow:

```bash
gh run list --workflow macos-release.yml --limit 5
gh run watch <run-id> --exit-status
```

The workflow builds the CLI, builds `apps/macos/build/Zapper.app` with a bundled
Node/CLI/PM2 runtime, packages `Zapper-v<version>-macOS.zip` and
`Zapper-macOS.zip`, then creates or updates the GitHub Release for the tag. To
rebuild an asset without pushing a new tag, run the workflow manually with
`release_tag` set to the existing tag.

The macOS release workflow fails if any required signing or notarization value
is missing. It imports `CSC_LINK` into a temporary keychain, auto-detects the
Developer ID Application signing identity, signs with the hardened runtime,
submits to Apple notarization, staples the app, and then uploads the release
zips.
The app and nested runtime binaries are signed with
`apps/macos/Signing/Zapper.entitlements`; Node/V8 requires those hardened
runtime entitlements to run from the notarized app bundle.

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
   npm view @mp-lb/zapper version
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
pnpm --filter @mp-lb/zapper build       # Ensure latest CLI build
pnpm --filter @mp-lb/zapper publish     # Publish to npm
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
- Verify `packages/cli/package.json` has correct name and version
- Ensure no duplicate version exists on npm
- Check if there are publishing restrictions
- If CI shows auth or 2FA errors, confirm `proj/secrets.txt.enc` contains
  `NPM_TOKEN`, the repository has `SECRETS_KEY`, and the token has publish
  access to `@mp-lb/zapper`.
- If publish fails with `E404 Not Found - PUT https://registry.npmjs.org/@mp-lb%2fzapper`, verify the npm scope owner exists and the publishing identity has rights to it:
  - `mp-lb` must exist on npm as the owning user or organization
  - the token owner must have publish access to the `@mp-lb` scope

**If the Version Packages PR doesn't appear:**
- Verify you committed changeset files (should be in `.changeset/` directory)
- Check if changesets action is properly configured in `.github/workflows/`
- Wait a few minutes - the PR creation can take time
