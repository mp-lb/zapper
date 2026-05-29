# Library Release

Use this process for publishable library packages.

## Process

1. Start from the latest `main`:

```sh
git checkout main
git pull --ff-only origin main
```

2. Create a changeset:

```sh
pnpm changeset
```

3. Commit the code and changeset.
4. Push to GitHub.

The GitHub release workflow handles versioning, changelog updates, publishing,
release commits, and tags.

5. Watch the release workflow and verify npm after it completes:

```sh
gh run list --branch main --limit 5
npm view <package-name> version dist.tarball --json
npm pack <package-name>@<version> --dry-run
```

6. Pull `main` again after the workflow publishes:

```sh
git pull --ff-only origin main
```

The post-release pull brings down the release commit that updates package
versions, changelogs, and removes the consumed changeset.

## Notes

- Choose `patch` for fixes and small compatible changes.
- Choose `minor` for new compatible APIs.
- Choose `major` for breaking API, behavior, type, or export changes.
- The changeset file does not need to be manually edited after it is created.
