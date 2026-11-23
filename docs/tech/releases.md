# Releases

Npm packages (`@mp-lb/zapper`, `@mp-lb/zapper-sdk`, and `@mp-lb/zapper-react`) publish automatically when their packed build output changes. Push to `main`; the release workflow builds, lints, typechecks, tests, compares each package with npm, and publishes the next patch version only for changed packages. No changeset or release note is required.

Run `zap t publish-packages -- --dry-run` to preview package comparisons. Check the [release workflow](../../.github/workflows/publish.yaml) and `npm view <package-name> version` after CI.

The private `packages/scripts` package owns the typed publisher and publication verifier. CI invokes both through `tsx`; `FSSSTACK_RELEASE_RESULT` supplies the report to `zap t verify-publication`.

A successful publish does not mean the package is installable immediately. npm
scans new versions before serving their tarballs; its [published guidance](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)
allows for delays of fifteen minutes or more. The verifier checks both exact
version metadata and tarball availability, reports what it is waiting for, and
retries up to 120 times at ten-second intervals. If processing outlasts that
window, check the named version's npm status and rerun verification once it is
available. Do not republish the same version or interpret this as an IAM failure.
