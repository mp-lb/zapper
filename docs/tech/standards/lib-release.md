# Library and CLI releases

Push to `main`. CI checks the project, builds public npm packages, and compares their packed files with the latest published versions. If a package changed, CI publishes the next patch version. If it did not, CI skips it. There are no changesets, release notes, or manual version bumps.

The target repository's `scripts/auto-publish.mjs` handles comparison and publishing. It processes workspace dependencies first and ignores only the package manifest's `version` field. Keep generated package files deterministic; a timestamp that changes on every build would cause a release on every push.

Run `node scripts/auto-publish.mjs --dry-run` to preview. After CI, check the release workflow and `npm view <package-name> version`. The workflow uses the repository's npm credential; ArcNet projects may supply it through the `publish` secret consumer, but FSS Stack does not require ArcNet.
