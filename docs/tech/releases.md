# Releases

Npm packages (`@mp-lb/zapper`, `@mp-lb/zapper-sdk`, and `@mp-lb/zapper-react`) publish automatically when their packed build output changes. Push to `main`; the release workflow builds, lints, typechecks, tests, compares each package with npm, and publishes the next patch version only for changed packages. No changeset or release note is required.

Run `zap t publish-packages -- --dry-run` to preview package comparisons. Check the [release workflow](../../.github/workflows/publish.yaml) and `npm view <package-name> version` after CI.

The private `packages/scripts` package owns the typed publisher and publication verifier. CI invokes both through `tsx`; `FSSSTACK_RELEASE_RESULT` supplies the report to `zap t verify-publication`.
