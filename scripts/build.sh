#!/usr/bin/env bash
# scripts/build.sh — Build script for Bizarre Cafe
#
# Compiles TypeScript to JavaScript using tsc.
# Usage:
#   bash scripts/build.sh          # Build in production mode
#   bash scripts/build.sh --dev    # Build in development mode (with source maps)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# ─── Parse Arguments ─────────────────────────────────────────────────

MODE="${1:-prod}"

# ─── Environment ─────────────────────────────────────────────────────

if [ "$MODE" = "dev" ]; then
  echo "🔧 Building in development mode..."
  export NODE_ENV=development
else
  echo "🏗️  Building in production mode..."
  export NODE_ENV=production
fi

# ─── Pre-flight Checks ──────────────────────────────────────────────

echo ""
echo "📋 Checking dependencies..."

if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules not found. Running npm install..."
  npm install --silent 2>/dev/null || {
    echo "❌ npm install failed. Please install dependencies first."
    exit 1
  }
fi

# Check for .env file (for config validation)
if [ -f ".env" ]; then
  echo "📄 Loading .env..."
  export $(grep -v '^#' .env | xargs)
fi

# ─── Type Check ──────────────────────────────────────────────────────

echo ""
echo "🔍 Running type check..."
npx tsc --noEmit 2>&1 || {
  echo "❌ Type check failed. Fix errors before building."
  exit 1
}
echo "✅ Type check passed."

# ─── Compile ─────────────────────────────────────────────────────────

echo ""
echo "📦 Compiling TypeScript..."
npx tsc 2>&1 || {
  echo "❌ TypeScript compilation failed."
  exit 1
}

echo "✅ Compilation complete."

# ─── Post-build ──────────────────────────────────────────────────────

echo ""
echo "📊 Build summary:"
echo "   Output directory: dist/"
echo "   Total files: $(find dist -type f | wc -l)"
echo "   Total size: $(du -sh dist/ | cut -f1)"

# ─── Done ────────────────────────────────────────────────────────────

echo ""
echo "🎉 Build successful!"
