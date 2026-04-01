#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <output-root> [fixture-name]" >&2
  exit 1
fi

OUTPUT_ROOT="$1"
FIXTURE_NAME="${2:-checkout-fixture}"
MAIN_DIR="${OUTPUT_ROOT}/${FIXTURE_NAME}-main"
WORKTREE_DIR="${OUTPUT_ROOT}/${FIXTURE_NAME}-worktree"

rm -rf "$MAIN_DIR" "$WORKTREE_DIR"
mkdir -p "$MAIN_DIR"

git init "$MAIN_DIR" >/dev/null
git -C "$MAIN_DIR" config user.name "Zapper E2E"
git -C "$MAIN_DIR" config user.email "zapper-e2e@example.com"

cat > "$MAIN_DIR/zap.yaml" <<'YAML'
project: instance-checkout-test
native:
  app:
    cmd: node -e "setInterval(() => console.log('instance checkout fixture'), 1000)"
YAML

cat > "$MAIN_DIR/README.md" <<'TXT'
Instance checkout e2e fixture
TXT

git -C "$MAIN_DIR" add README.md zap.yaml
git -C "$MAIN_DIR" commit -m "Initialize instance checkout fixture" >/dev/null
git -C "$MAIN_DIR" worktree add "$WORKTREE_DIR" HEAD >/dev/null

echo "MAIN_DIR=$MAIN_DIR"
echo "WORKTREE_DIR=$WORKTREE_DIR"
