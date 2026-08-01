#!/usr/bin/env bash
# scripts/test.sh — Test runner for Bizarre Cafe
#
# Runs the test suite using Vitest.
# Usage:
#   bash scripts/test.sh             # Run all tests
#   bash scripts/test.sh --watch     # Run in watch mode
#   bash scripts/test.sh --coverage  # Run with coverage report
#   bash scripts/test.sh <pattern>   # Run tests matching pattern

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# ─── Environment ─────────────────────────────────────────────────────

export NODE_ENV=test

# ─── Check Dependencies ──────────────────────────────────────────────

if [ ! -d "node_modules/vitest" ]; then
  echo "⚠️  Vitest not installed. Running npm install..."
  npm install --silent 2>/dev/null || {
    echo "❌ npm install failed."
    exit 1
  }
fi

# ─── Parse Arguments ─────────────────────────────────────────────────

RUN_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --watch|-w)
      RUN_ARGS+=("--watch")
      ;;
    --coverage|-c)
      RUN_ARGS+=("--coverage")
      ;;
    --run)
      RUN_ARGS+=("--run")
      ;;
    --help|-h)
      echo "Usage: bash scripts/test.sh [OPTIONS] [PATTERN]"
      echo ""
      echo "Options:"
      echo "  --watch, -w       Run in watch mode"
      echo "  --coverage, -c    Generate coverage report"
      echo "  --run             Run once (default)"
      echo "  --help, -h        Show this help"
      exit 0
      ;;
    *)
      RUN_ARGS+=("$arg")
      ;;
  esac
done

# ─── Run Tests ───────────────────────────────────────────────────────

echo "🧪 Running tests in ${NODE_ENV} mode..."
echo ""

# Check for test files
TEST_COUNT=$(find . -path ./node_modules -prune -o -name "*.test.ts" -print -o -name "*.spec.ts" -print 2>/dev/null | wc -l)

if [ "$TEST_COUNT" -eq 0 ]; then
  echo "⚠️  No test files found. Create .test.ts or .spec.ts files in src/."
  echo "   To skip this warning, run with --run."
fi

echo "📝 Found $TEST_COUNT test file(s)."
echo ""

# Run vitest
npx vitest run "${RUN_ARGS[@]}" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ All tests passed!"
else
  echo ""
  echo "❌ Tests failed (exit code: $EXIT_CODE)."
fi

exit $EXIT_CODE
