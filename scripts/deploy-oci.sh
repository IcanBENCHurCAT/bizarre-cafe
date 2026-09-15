#!/usr/bin/env bash
###############################################################################
# deploy-oci.sh — Manual OCI Ampere VM deployment for Bizarre Cafe
#
# Usage:
#   ./scripts/deploy-oci.sh [HOST] [SSH_KEY_PATH]
#
# Examples:
#   ./scripts/deploy-oci.sh
#   ./scripts/deploy-oci.sh 132.226.123.45 ~/.ssh/id_ed25519
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

HOST="${1:-${OCI_VM_HOST:-}}"
SSH_KEY="${2:-${OCI_SSH_KEY_PATH:-${HOME}/.ssh/id_rsa}}"
SSH_USER="${OCI_SSH_USER:-ubuntu}"
REMOTE_DIR="/opt/bizarre-cafe"

if [[ -z "$HOST" ]]; then
  echo "❌ ERROR: No OCI VM host specified."
  echo "   Provide host as first argument or set OCI_VM_HOST environment variable."
  echo "   Usage: $0 <host> [ssh_key_path]"
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -f "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

echo "============================================================"
echo "  Bizarre Cafe OCI Ampere VM Deployment"
echo "  Host: ${SSH_USER}@${HOST}"
echo "  Target Dir: ${REMOTE_DIR}"
echo "============================================================"

echo "▶ [1/4] Preparing remote deployment directory..."
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" "sudo mkdir -p ${REMOTE_DIR} && sudo chown -R ${SSH_USER}:${SSH_USER} ${REMOTE_DIR}"

echo "▶ [2/4] Synchronizing deployment manifests..."
scp "${SSH_OPTS[@]}" \
  "${PROJECT_DIR}/docker-compose.prod.yml" \
  "${PROJECT_DIR}/Caddyfile" \
  "${SSH_USER}@${HOST}:${REMOTE_DIR}/"

echo "▶ [3/4] Pulling latest containers and restarting stack..."
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" "bash -s" << 'EOF'
set -e
cd /opt/bizarre-cafe
if [ -f .env ]; then
  echo "Found existing .env"
else
  echo "Warning: .env not found in /opt/bizarre-cafe. Ensure required environment variables are set."
fi
docker compose -f docker-compose.prod.yml pull app || true
docker compose -f docker-compose.prod.yml up -d --remove-orphans
EOF

echo "▶ [4/4] Validating deployment health..."
DOMAIN="${DOMAIN:-bizarre-cafe.duckdns.org}"
bash "${PROJECT_DIR}/scripts/check-deployment.sh" "${DOMAIN}"

echo "============================================================"
echo "✓ OCI Deployment completed successfully!"
echo "============================================================"
