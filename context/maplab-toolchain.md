## MapLab toolchain

Use mise to select the project's Node and pnpm versions from `.node-version` and `package.json#packageManager`. Do not duplicate version pins in mise configuration. Run `mise trust` and `mise install` when setting up a checkout; use an activated shell or `mise exec -- zap ...` so tasks inherit the selected tools. Zapper remains the task/process runner.

Prefer the installed tools' built-in help and verify authentication when needed; do not assume every cloud service is authenticated. Keep local CLI commands linked to the intended local build.
