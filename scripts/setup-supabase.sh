#!/usr/bin/env bash
#
# setup-supabase.sh — Deploy Supabase migrations and seed data.
#
# Usage:
#   ./scripts/setup-supabase.sh [local|production]
#
# Requires:
#   - Supabase CLI  (`supabase` binary on PATH), OR
#   - `psql` with correct environment variables (for direct connection)
#
# Environment variables (or .env file):
#   SUPABASE_URL        — Supabase project URL
#   SUPABASE_SERVICE_KEY — Service role key (for direct SQL)
#   SUPABASE_PROJECT_REF — Project ref (used by CLI)
#   PGHOST / PGPORT / PGUSER / PGPASSWORD — Direct PostgreSQL credentials (fallback)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
SEED_SCRIPT="$PROJECT_ROOT/scripts/seed-data.sh"

# -----------------------------------------------------------
# Detect environment
# -----------------------------------------------------------
ENVIRONMENT="${1:-local}"

if [ "$ENVIRONMENT" = "local" ]; then
  SUPABASE_URL="${SUPABASE_URL:-http://localhost:54321}"
  SUPABASE_KEY="${SUPABASE_SERVICE_KEY:-}"
  USE_CLI=true
elif [ "$ENVIRONMENT" = "production" ]; then
  if [ -z "${SUPABASE_URL:-}" ]; then
    echo "ERROR: SUPABASE_URL is required for production deployment."
    echo "  Export it or create a .env file with SUPABASE_URL=https://<PROJECT_REF>.supabase.co"
    exit 1
  fi
  if [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
    echo "ERROR: SUPABASE_SERVICE_KEY is required for production deployment."
    echo "  Export it or create a .env file with SUPABASE_SERVICE_KEY=<your-service-role-key>"
    exit 1
  fi
  SUPABASE_KEY="$SUPABASE_SERVICE_KEY"
  USE_CLI=false
else
  echo "ERROR: Unknown environment '$ENVIRONMENT'. Use 'local' or 'production'."
  exit 1
fi

# -----------------------------------------------------------
# Load .env if present
# -----------------------------------------------------------
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Re-override from .env if explicitly set there
SUPABASE_URL="${SUPABASE_URL:-$SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_KEY:-$SUPABASE_SERVICE_KEY:-$SUPABASE_ANON_KEY}"

echo "============================================"
echo "  Bizarre Cafe — Supabase Setup"
echo "  Environment: $ENVIRONMENT"
echo "  URL: $SUPABASE_URL"
echo "============================================"
echo ""

# -----------------------------------------------------------
# Method 1: Use Supabase CLI
# -----------------------------------------------------------
deploy_with_cli() {
  if ! command -v supabase &>/dev/null; then
    echo "Supabase CLI not found. Install with: npm i -g supabase"
    echo "Falling back to direct SQL execution..."
    return 1
  fi

  echo "[1/3] Using Supabase CLI to push migrations..."

  # Link the project if not already linked
  if [ -n "${SUPABASE_PROJECT_REF:-}" ]; then
    supabase link --project-ref "$SUPABASE_PROJECT_REF" 2>/dev/null || true
  fi

  # Push migrations
  supabase db push 2>/dev/null || {
    echo "  CLI push failed, falling back to direct SQL..."
    return 1
  }

  echo "  ✅ CLI migrations pushed successfully."
  return 0
}

# -----------------------------------------------------------
# Method 2: Direct SQL execution via psql or curl
# -----------------------------------------------------------
deploy_with_sql() {
  echo "[1/3] Deploying migrations via direct SQL..."

  if [ -z "$SUPABASE_KEY" ]; then
    echo "ERROR: SUPABASE_KEY is required for direct SQL deployment."
    echo "  Export SUPABASE_SERVICE_KEY=<your-service-role-key>"
    exit 1
  fi

  # Try psql first
  if command -v psql &>/dev/null; then
    echo "  Using psql..."

    # Build connection string from SUPABASE_URL or environment variables
    local db_url=""
    if [ -n "${SUPABASE_URL:-}" ]; then
      # Convert Supabase URL to postgres:// connection string
      # Format: https://<ref>.supabase.co -> postgresql://postgres.<ref>:<db-pass>@<ref>.supabase.co:5432/postgres
      local ref="${SUPABASE_URL##https://}"
      ref="${ref%%.*}"  # extract project ref

      local db_host="${SUPABASE_URL#*://}"
      db_host="${db_host%%/*}"

      db_url="postgresql://postgres.$ref:${PGPASSWORD:-change-that-should-be-set}@$db_host:5432/postgres"
    fi

    if [ -n "$db_url" ] && [ -n "${PGPASSWORD:-}" ]; then
      psql "$db_url" -v ON_ERROR_STOP=1 -f "$MIGRATIONS_DIR/001_initial_schema.sql" 2>&1
      echo "  ✅ psql migration complete."
      return 0
    fi
  fi

  # Fallback: curl to Supabase REST API
  echo "  Using curl (Supabase REST API)..."

  local sql
  sql=$(cat "$MIGRATIONS_DIR/001_initial_schema.sql")

  local response
  response=$(curl -s -X POST \
    "$SUPABASE_URL/rest/v1/" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"sql\": \"$(echo "$sql" | sed 's/"/\\"/g')\"}" 2>&1) || true

  if echo "$response" | grep -q "error"; then
    echo "  REST API error: $response"
    return 1
  fi

  echo "  ✅ SQL migration applied via REST API."
  return 0
}

# -----------------------------------------------------------
# Deploy migrations
# -----------------------------------------------------------
deploy_migrations() {
  if [ "$USE_CLI" = true ]; then
    if ! deploy_with_cli; then
      deploy_with_sql
    fi
  else
    deploy_with_sql
  fi
}

# -----------------------------------------------------------
# Verify migration
# -----------------------------------------------------------
verify_migration() {
  echo ""
  echo "[2/3] Verifying migration..."

  if [ -z "$SUPABASE_KEY" ]; then
    echo "  ⚠ Skipping verification (no SUPABASE_KEY set)."
    return 0
  fi

  local response
  response=$(curl -s -X GET \
    "$SUPABASE_URL/rest/v1/rooms?select=name" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY") || true

  if echo "$response" | grep -q '"name"'; then
    echo "  ✅ rooms table exists and is accessible."
  else
    echo "  ⚠ Could not verify rooms table. Migration may not have applied."
    echo "  Raw response: $response"
  fi
}

# -----------------------------------------------------------
# Run seed script (optional)
# -----------------------------------------------------------
seed_data() {
  echo ""
  echo "[3/3] Running seed data script..."

  if [ -f "$SEED_SCRIPT" ]; then
    chmod +x "$SEED_SCRIPT"
    bash "$SEED_SCRIPT" "$ENVIRONMENT" 2>&1 || {
      echo "  ⚠ Seed script failed (non-fatal)."
      echo "  You can run it later with: bash scripts/seed-data.sh"
    }
  else
    echo "  ⚠ No seed script found at $SEED_SCRIPT. Skipping."
  fi
}

# -----------------------------------------------------------
# Main
# -----------------------------------------------------------
echo ""
echo "Starting deployment..."
echo ""

deploy_migrations
verify_migration
seed_data

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Check Supabase Dashboard: $SUPABASE_URL"
echo "  2. Verify tables: tables agents, rooms, messages, skills, collectibles, tips, events, event_participants, cafe_activity"
echo "  3. Test queries against the REST API"
echo ""
