## MapLab toolchain

Every project using the MapLab augmentation uses mise for local tool selection. Read Node from `.node-version`. For pnpm projects, read pnpm from `package.json#packageManager`; do not duplicate these pins in `mise.toml`. npm projects keep npm and use the version bundled with the selected Node unless they explicitly pin another version. Preserve existing project versions and package managers.

Run `mise trust` and `mise install` when setting up a checkout. Use an activated shell or `mise exec -- zap ...` so tasks inherit the selected tools. Zapper remains the task/process runner. Verify the resolved Node and package-manager versions against their canonical sources.

Prefer installed tools' built-in help and verify authentication when needed; do not assume every cloud service is authenticated. Keep local CLI commands linked to the intended local build through a version-independent PATH directory, so changing the selected Node version does not hide `zap` or `fm`.
