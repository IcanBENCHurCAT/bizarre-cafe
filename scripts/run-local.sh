#!/usr/bin/env bash
###############################################################################
# run-local.sh — Start the local development environment
#
# Usage:
#   ./scripts/run-local.sh [--with-vllm] [--skip-migrations]
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m▶\033[0m $*"; }
info() { echo -e "\033[1;32m✓\033[0m $*"; }
err()  { echo -e "\033[1;31m✗\033[0m $*" >&2; }

# ── Parse flags ─────────────────────────────────────────────────────────────
ENABLE_VLLM=false
SKIP_MIGRATIONS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-vllm)        ENABLE_VLLM=true; shift ;;
    --skip-migrations)  SKIP_MIGRATIONS=true; shift ;;
    *)                  err "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Pre-flight checks ──────────────────────────────────────────────────────
log "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install from https://docker.com"
  exit 1
fi

if ! command -v docker compose &>/dev/null && ! command -v docker-compose &>/dev/null; then
  err "Docker Compose not found. Install 'docker compose' (Docker Desktop) or 'docker-compose'."
  exit 1
fi

# Determine which compose command is available
if command -v docker compose &>/dev/null; then
  DC="docker compose"
else
  DC="docker-compose"
fi

# ── 1. Start database ──────────────────────────────────────────────────────
log "Starting PostgreSQL..."
$DC up -d postgres

# Wait for DB to be ready
log "Waiting for database to be ready..."
for i in $(seq 1 30); do
  if docker exec bizarre-cafe-postgres-1 pg_isready -U postgres &>/dev/null 2>&1; then
    info "Database is ready."
    break
  fi
  if [[ $i -eq 30 ]]; then
    err "Database failed to start within 30 seconds."
    exit 1
  fi
  sleep 2
done

# ── 2. Start Supabase REST ─────────────────────────────────────────────────
log "Starting Supabase REST..."
$DC up -d supabase-rest

# Wait for Supabase to be ready
for i in $(seq 1 20); do
  if docker exec bizarre-cafe-supabase-rest-1 pg_isready -U postgres &>/dev/null 2>&1; then
    info "Supabase REST is ready."
    break
  fi
  if [[ $i -eq 20 ]]; then
    warn "Supabase REST took a while to start — continuing anyway."
  fi
  sleep 2
done

# ── 3. Run migrations ──────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATIONS" == false ]]; then
  log "Running migrations..."
  if [[ -f "scripts/setup-supabase.sh" ]]; then
    bash scripts/setup-supabase.sh || warn "Migration script failed — continuing."
  else
    warn "No setup-supabase.sh found — skipping migrations."
  fi
fi

# ── 4. Start vLLM (optional) ───────────────────────────────────────────────
if [[ "$ENABLE_VLLM" == true ]]; then
  log "Starting vLLM (may take a while to download the model)..."
  $DC up -d vllm

  # Wait for vLLM to be ready
  log "Waiting for vLLM to be ready..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/v1/models &>/dev/null 2>&1; then
      info "vLLM is ready."
      break
    fi
    if [[ $i -eq 60 ]]; then
      warn "vLLM may not be ready — starting app anyway."
    fi
    sleep 3
  done
else
  info "Skipping vLLM (use --with-vllm to enable)."
fi

# ── 5. Start the app ───────────────────────────────────────────────────────
log "Starting bizarre-cafe app..."
$DC up app

# ── 6. Open in browser ─────────────────────────────────────────────────────
if command -v open &>/dev/null; then
  open http://localhost:3000 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:3000 2>/dev/null || true
else
  echo ""
  log "Open http://localhost:3000 in your browser"
fi

echo ""
echo "============================================================"
info "Local dev environment is running! 🚀"
echo "   App       : http://localhost:3000"
echo "   PostgreSQL: localhost:5432"
echo "   Supabase  : localhost:54321"
echo "   vLLM      : localhost:8000  (if enabled)"
echo "============================================================"
