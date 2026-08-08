#!/usr/bin/env bash
# scripts/cleanup.sh — Cleanup temporary files for Bizarre Cafe
#
# Removes build artifacts, temp files, cache directories, and other
# non-essential files to free disk space and clean the workspace.
#
# Usage:
#   bash scripts/cleanup.sh              # Dry run (shows what would be deleted)
#   bash scripts/cleanup.sh --force      # Actually delete files
#   bash scripts/cleanup.sh --all        # Full cleanup (includes node_modules)
#   bash scripts/cleanup.sh --help       # Show help

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# ─── Globals ─────────────────────────────────────────────────────────

DRY_RUN=true
FULL=false
DELETED=0
SKIPPED=0

# ─── Parse Arguments ─────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --force|-f)
      DRY_RUN=false
      ;;
    --all|-a)
      FULL=true
      DRY_RUN=false
      ;;
    --help|-h)
      echo "Usage: bash scripts/cleanup.sh [OPTIONS]"
      echo ""
      echo "Cleanup script for Bizarre Cafe."
      echo ""
      echo "Options:"
      echo "  --force, -f       Actually delete files (default: dry run)"
      echo "  --all, -a         Full cleanup including node_modules"
      echo "  --help, -h        Show this help"
      echo ""
      echo "Examples:"
      echo "  bash scripts/cleanup.sh              # Dry run (safe)"
      echo "  bash scripts/cleanup.sh --force      # Clean with confirmation"
      echo "  bash scripts/cleanup.sh --all        # Full clean (includes deps)"
      exit 0
      ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────

should_skip() {
  # Files/dirs that should never be deleted
  local target="$1"
  case "$target" in
    node_modules | .git | .well-known | .agents | dist)
      if [ "$FULL" = true ]; then return 0; fi  # allow if --all
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

cleanup_item() {
  local path="$1"
  local desc="$2"

  if [ -e "$path" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "  [DRY RUN] Would delete: $desc ($path)"
    else
      rm -rf "$path" 2>/dev/null && {
        echo "  ✅ Deleted: $desc ($path)"
        DELETED=$((DELETED + 1))
      } || {
        echo "  ❌ Failed to delete: $path"
        SKIPPED=$((SKIPPED + 1))
      }
    fi
  else
    echo "  ⏭️  Skips (not found): $desc ($path)"
    SKIPPED=$((SKIPPED + 1))
  fi
}

# ─── Cleanup Items ──────────────────────────────────────────────────

echo "🧹 Bizarre Cafe — Cleanup Script"
echo "================================="
echo ""
echo "Mode: $(if [ "$DRY_RUN" = true ]; then echo "DRY RUN (safe)"; else echo "ACTUAL DELETION"; fi)"
if [ "$FULL" = true ]; then
  echo "Scope: Full (includes node_modules)"
else
  echo "Scope: Selective (preserves node_modules)"
fi
echo ""

# ─── Build Artifacts ─────────────────────────────────────────────────

echo "📦 Build artifacts:"
cleanup_item "dist/" "Build output (dist/)"
cleanup_item "*.tsbuildinfo" "TypeScript build info"

# ─── Cache Directories ───────────────────────────────────────────────

echo ""
echo "🗂️  Cache directories:"
cleanup_item "node_modules/.cache/" "npm cache"
cleanup_item ".eslintcache" "ESLint cache"
cleanup_item ".vitest/" "Vitest cache"
cleanup_item "coverage/" "Coverage reports"
cleanup_item ".nyc_output/" "NYC coverage output"

# ─── Temp / Log Files ───────────────────────────────────────────────

echo ""
echo "📝 Temporary & log files:"
find . -path ./node_modules -prune -o -name "*.tmp" -print -o -name "*.bak" -print -o -name "*.log" -print -o -name "*.cache" -print 2>/dev/null | while read -r file; do
  cleanup_item "$file" "Temp file"
done

# ─── IDE / OS Files ─────────────────────────────────────────────────

echo ""
echo "💻 IDE / OS artifacts:"
cleanup_item ".DS_Store" "macOS desktop store"
cleanup_item ".vscode/" "VS Code workspace"
cleanup_item ".idea/" "IntelliJ project"
find . -path ./node_modules -prune -o -name "*.swp" -print -o -name "*.swo" -print -o -name "*~" -print 2>/dev/null | while read -r file; do
  cleanup_item "$file" "Editor swap file"
done

# ─── Node Modules (only with --all) ─────────────────────────────────

if [ "$FULL" = true ]; then
  echo ""
  echo "📦 Node modules:"
  cleanup_item "node_modules/" "Node dependencies"
  cleanup_item "package-lock.json" "Package lock file (will regenerate)"
fi

# ─── Summary ─────────────────────────────────────────────────────────

echo ""
echo "================================="
echo "Cleanup complete!"
echo "  Removed: $DELETED"
echo "  Skipped: $SKIPPED"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "ℹ️  This was a dry run. No files were deleted."
  echo "   Run with --force to actually delete files."
  echo "   Run with --all to include node_modules."
else
  echo "✅ Files cleaned up successfully."
fi
