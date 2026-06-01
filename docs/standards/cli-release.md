# CLI Release

Use this process for publishable CLI packages.

## Process

1. Create a changeset:

```sh
pnpm changeset
```

2. Commit the code and changeset.
3. Push to GitHub.

The GitHub release workflow handles versioning, changelog updates, publishing,
release commits, and tags.

## Notes

- Choose `patch` for fixes and small compatible changes.
- Choose `minor` for new compatible features.
- Choose `major` for breaking CLI, input, output, or package API changes.
- The changeset file does not need to be manually edited after it is created.

