# Releases

Npm packages (`@mp-lb/zapper`, `@mp-lb/zapper-sdk`, and `@mp-lb/zapper-react`) publish automatically when their packed build output changes. Push to `main`; the release workflow builds, tests, compares each package with npm, and publishes the next patch version only for changed packages. No changeset or release note is required.

Run `node scripts/auto-publish.mjs --dry-run` to preview package comparisons. Check the [release workflow](../../.github/workflows/publish.yaml) and `npm view <package-name> version` after CI.

The macOS app has a separate [release workflow](../../.github/workflows/release-macos.yaml). It builds signed and notarized assets for a `v*` tag, or through manual dispatch with `release_tag`. Npm package publishing does not create a macOS release tag.
