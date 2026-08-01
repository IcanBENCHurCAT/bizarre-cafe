#!/usr/bin/env bash
###############################################################################
# test-local.sh — Local test suite runner
#
# Usage:
#   ./scripts/test-local.sh
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m▶\033[0m $*"; }
info() { echo -e "\033[1;32m✓\033[0m $*"; }
err()  { echo -e "\033[1;31m✗\033[0m $*" >&2; }

cd "$PROJECT_DIR" || exit 1

echo "============================================================"
echo "  bizarre-cafe — Local Test Suite"
echo "============================================================"
echo ""

# ── 1. Lint ─────────────────────────────────────────────────────────────────
log "Running ESLint..."
if npm run lint &>/dev/null; then
  info "ESLint passed"
else
  # If ESLint isn't configured yet, skip gracefully
  if grep -q '"lint"' package.json 2>/dev/null; then
    err "ESLint failed"
    exit 1
  else
    warn "No lint script in package.json — skipping."
  fi
fi

# ── 2. Type check ───────────────────────────────────────────────────────────
log "Running TypeScript type check..."
if npx tsc --noEmit 2>/dev/null; then
  info "TypeScript check passed"
else
  # If no tsconfig yet, skip gracefully
  if [[ -f "tsconfig.json" ]]; then
    err "TypeScript check failed"
    exit 1
  else
    warn "No tsconfig.json found — skipping."
  fi
fi

# ── 3. Unit tests ──────────────────────────────────────────────────────────
log "Running vitest..."
if npm run test &>/dev/null; then
  info "Tests passed"
else
  # If no test script yet, skip gracefully
  if grep -q '"test"' package.json 2>/dev/null; then
    err "Tests failed"
    exit 1
  else
    warn "No test script in package.json — skipping."
  fi
fi

echo ""
echo "============================================================"
info "All checks passed! ✅"
echo "============================================================"
