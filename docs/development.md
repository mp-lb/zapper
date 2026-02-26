# Local Development

Guide for contributing to zapper.

## Prerequisites

- Node.js 18+
- pnpm
- PM2 (`npm install -g pm2`)
- Docker (for testing docker services)

## Getting Started

```bash
npm uninstall --global @maplab/zapper  # Start fresh
pnpm add --global @maplab/zapper  # Make sure its installed with pnpm
pnpm install
pnpm build
pnpm link --global
```

After linking, your global `zap` command points to your local build. Make changes, run `pnpm build`, and test immediately.

## Linking & Unlinking

```bash
which zap                 # Should show pnpm global path
ls -la $(which zap)       # Should symlink to your dist/index.js

# Unlink when done
pnpm unlink --global
npm install --global @maplab/zapper  # Reinstall from npm
```

## Testing

```bash
pnpm test                        # Run all tests
pnpm test --watch                # Watch mode
pnpm test yaml-parser.test.ts    # Specific file
pnpm test:e2e                    # E2E in isolated Linux VM (macOS + Lima)
pnpm dev:renderer                # Renderer vibe sheet (local development preview)
```

For manual testing, use the example projects in `examples/`. After building, cd into one and run `zap up`.

### E2E in Linux VM (macOS)

```bash
bash ./etc/e2e_setup.sh          # One-time: install Lima + provision base VM
pnpm test:e2e                    # Each run clones an isolated throwaway VM
```

Notes:

- `pnpm test:e2e` runs in an ephemeral cloned VM and auto-deletes it on exit.
- Base VM name defaults to `zapper-e2e-base` (override with `ZAP_E2E_BASE_VM_NAME`).
- Keep a failed run VM for debugging: `ZAP_E2E_KEEP_VM=1 pnpm test:e2e`.
- By default, `pnpm test:e2e` is strict and fails if VM setup is missing.
