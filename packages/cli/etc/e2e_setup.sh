#!/usr/bin/env bash
set -euo pipefail

BASE_VM_NAME="${ZAP_E2E_BASE_VM_NAME:-zapper-e2e-base}"
NODE_MAJOR="${ZAP_E2E_NODE_MAJOR:-20}"
VM_READY_FILE="/var/tmp/zapper-e2e-base-ready"

log() {
  printf '[e2e-setup] %s\n' "$*"
}

fail() {
  printf '[e2e-setup] %s\n' "$*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This setup script currently supports macOS only."
fi

if ! command -v brew >/dev/null 2>&1; then
  fail "Homebrew is required. Install Homebrew first, then rerun this script."
fi

if ! command -v limactl >/dev/null 2>&1; then
  log "Installing Lima with Homebrew..."
  brew install lima
fi

vm_exists() {
  limactl list 2>/dev/null | awk 'NR>1 { print $1 }' | grep -Fxq "$BASE_VM_NAME"
}

vm_status() {
  limactl list 2>/dev/null | awk -v vm="$BASE_VM_NAME" 'NR>1 && $1==vm { print $2 }'
}

if ! vm_exists; then
  log "Creating base Linux VM '${BASE_VM_NAME}'..."
  limactl create --name "$BASE_VM_NAME" --tty=false --disk 30 template:ubuntu
else
  log "Base VM '${BASE_VM_NAME}' already exists."
fi

if [[ "$(vm_status)" != "Running" ]]; then
  log "Starting base VM '${BASE_VM_NAME}'..."
  limactl start "$BASE_VM_NAME"
fi

log "Provisioning Node.js, pnpm, PM2, and rsync inside '${BASE_VM_NAME}'..."
limactl shell "$BASE_VM_NAME" -- env NODE_MAJOR="$NODE_MAJOR" VM_READY_FILE="$VM_READY_FILE" bash -lc '
set -euo pipefail

sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg rsync build-essential git lsof

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -Eq "^v${NODE_MAJOR}\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo npm install -g pnpm pm2

echo "ready" | sudo tee "$VM_READY_FILE" >/dev/null
'

if [[ "$(vm_status)" == "Running" ]]; then
  log "Stopping base VM '${BASE_VM_NAME}' to keep host clean..."
  limactl stop "$BASE_VM_NAME" >/dev/null
fi

log "Base VM setup complete."
log "Run E2E tests with isolated ephemeral VMs using: pnpm test:e2e"
