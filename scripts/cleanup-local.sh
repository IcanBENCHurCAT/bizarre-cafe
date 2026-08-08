#!/usr/bin/env bash
###############################################################################
# cleanup-local.sh — Tear down the local dev environment
#
# Usage:
#   ./scripts/cleanup-local.sh [--volumes]
#
#   --volumes    Also delete Docker volumes (erases local DB data!)
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m▶\033[0m $*"; }
info() { echo -e "\033[1;32m✓\033[0m $*"; }
warn() { echo -e "\033[1;33m⚠\033[0m $*" >&2; }
err()  { echo -e "\033[1;31m✗\033[0m $*" >&2; }

# ── Parse flags ─────────────────────────────────────────────────────────────
VOLUMES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --volumes) VOLUMES=true; shift ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Determine compose command ──────────────────────────────────────────────
if command -v docker compose &>/dev/null; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  err "Docker Compose not found."
  exit 1
fi

# ── Warning if removing volumes ─────────────────────────────────────────────
if [[ "$VOLUMES" == true ]]; then
  warn "WARNING: This will delete ALL local data (Docker volumes)!"
fi

# ── Tear down ──────────────────────────────────────────────────────────────
log "Tearing down local dev environment..."

VOLUME_FLAGS=()
if [[ "$VOLUMES" == true ]]; then
  VOLUME_FLAGS+=("-v")
fi

$DC down "${VOLUME_FLAGS[@]}" --remove-orphans 2>&1 || warn "Some containers may already be stopped."

info "Cleanup complete."
echo ""
echo "  Containers stopped and removed."
if [[ "$VOLUMES" == true ]]; then
  echo "  Volumes also deleted — local DB data is gone."
else
  echo "  Data volumes preserved. Use --volumes to remove them."
fi
