#!/usr/bin/env bash
###############################################################################
# deploy-gcp.sh — Production deployment for bizarre-cafe on Cloud Run
#
# Usage:
#   ./scripts/deploy-gcp.sh [TAG]
#
# Examples:
#   ./scripts/deploy-gcp.sh          # auto-increment tag
#   ./scripts/deploy-gcp.sh v1.2.3   # specific tag
###############################################################################
set -euo pipefail

# ── Globals ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ ERROR: No GCP project configured."
  echo "   Set GCP_PROJECT_ID or run: gcloud config set project <PROJECT_ID>"
  exit 1
fi

REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="bizarre-cafe"
TAG="${1:-$(date +%Y%m%d%H%M%S)-$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${TAG}"

# Required env vars (defaults)
DATABASE_URL="${DATABASE_URL:?ERROR: DATABASE_URL is required. Set it or use Cloud SQL connection.}"
SUPABASE_URL="${SUPABASE_URL:?ERROR: SUPABASE_URL is required}"
SUPABASE_KEY="${SUPABASE_KEY:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
MODEL="${MODEL:-Qwen/Qwen2.5-7B-Instruct}"
NODE_ENV="production"

# Memory / CPU limits
MEMORY="512Mi"
CPU="1"
MIN_INSTANCES="1"
MAX_INSTANCES="10"
TIMEOUT="300s"
CONCURRENCY="80"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m▶\033[0m $*"; }
info() { echo -e "\033[1;32m✓\033[0m $*"; }
warn() { echo -e "\033[1;33m⚠\033[0m $*" >&2; }
err()  { echo -e "\033[1;31m✗\033[0m $*" >&2; }

die()  { err "$@"; exit 1; }

# ── Prerequisite checks ─────────────────────────────────────────────────────
check_prerequisites() {
  log "Checking prerequisites..."

  # gcloud
  if ! command -v gcloud &>/dev/null; then
    die "gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
  fi

  local active_project
  active_project="$(gcloud config get-value project 2>/dev/null)"
  if [[ -z "$active_project" ]]; then
    die "No GCP project set. Run: gcloud config set project <PROJECT_ID>"
  fi

  # docker
  if ! command -v docker &>/dev/null; then
    die "Docker not found. Install from https://docker.com"
  fi

  # docker login
  if ! docker info &>/dev/null 2>&1; then
    die "Docker daemon not running. Start Docker Desktop / docker service first."
  fi

  # gcloud auth
  if ! gcloud auth print-access-token &>/dev/null 2>&1; then
    die "Not authenticated. Run: gcloud auth application-default login"
  fi

  info "All prerequisites met."
}

# ── Build & push ─────────────────────────────────────────────────────────────
build_and_push() {
  log "Building Docker image: ${IMAGE}"

  docker build \
    --tag "$IMAGE" \
    --platform linux/amd64 \
    -f "${PROJECT_DIR}/Dockerfile" \
    "$PROJECT_DIR" || die "Docker build failed"

  info "Build succeeded."

  log "Pushing image to GCR..."
  docker push "$IMAGE" || die "Docker push failed"

  info "Image pushed: ${IMAGE}"
}

# ── Deploy ───────────────────────────────────────────────────────────────────
deploy() {
  log "Deploying to Cloud Run..."

  # Build env-var flags
  local env_flags=()
  env_flags+=("--set-env-vars,DATABASE_URL=${DATABASE_URL}")
  [[ -n "$SUPABASE_URL" ]]        && env_flags+=("--set-env-vars,SUPABASE_URL=${SUPABASE_URL}")
  [[ -n "$SUPABASE_KEY" ]]        && env_flags+=("--set-env-vars,SUPABASE_KEY=${SUPABASE_KEY}")
  [[ -n "$SUPABASE_SERVICE_KEY" ]] && env_flags+=("--set-env-vars,SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}")
  [[ -n "$OPENAI_BASE_URL" ]]     && env_flags+=("--set-env-vars,OPENAI_BASE_URL=${OPENAI_BASE_URL}")
  [[ -n "$OPENAI_API_KEY" ]]      && env_flags+=("--set-env-vars,OPENAI_API_KEY=${OPENAI_API_KEY}")
  [[ -n "$MODEL" ]]               && env_flags+=("--set-env-vars,MODEL=${MODEL}")
  env_flags+=("--set-env-vars,NODE_ENV=${NODE_ENV}")

  gcloud run deploy "${SERVICE_NAME}" \
    --platform=managed \
    --region="${REGION}" \
    --image="${IMAGE}" \
    --memory="${MEMORY}" \
    --cpu="${CPU}" \
    --min-instances="${MIN_INSTANCES}" \
    --max-instances="${MAX_INSTANCES}" \
    --timeout="${TIMEOUT}" \
    --concurrency="${CONCURRENCY}" \
    --port=8080 \
    --allow-unauthenticated \
    --format=json \
    "${env_flags[@]}" \
    2>&1 || die "Cloud Run deployment failed"

  info "Deployment successful."
}

# ── Post-deploy ──────────────────────────────────────────────────────────────
post_deploy() {
  local url
  url="$(gcloud run services describe "${SERVICE_NAME}" \
    --platform=managed \
    --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null)"

  if [[ -n "$url" ]]; then
    echo ""
    echo "============================================================"
    echo "🚀  bizarre-cafe is live!"
    echo "    URL : ${url}"
    echo "    Image: ${IMAGE}"
    echo "    Region: ${REGION}"
    echo "============================================================"
    echo ""
    log "Checking health endpoint..."
    if curl -sf "${url}/health" &>/dev/null; then
      info "Health check passed ✓"
    else
      warn "Health check returned non-200 — may still be starting up."
    fi
  else
    warn "Could not resolve service URL — check gcloud run services list."
  fi

  echo ""
  echo "📋 Post-deploy checklist:"
  echo "   1. Verify environment variables are set correctly."
  echo "   2. Test key endpoints at ${url:-<service-url>}"
  echo "   3. Confirm database connectivity."
  echo "   4. Check Cloud Run logs: gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=bizarre-cafe'"
  echo "   5. Monitor Cloud Run metrics & set up alerts."
  echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo "============================================================"
  echo "  bizarre-cafe GCP Cloud Run Deploy"
  echo "  Project : ${PROJECT_ID}"
  echo "  Region  : ${REGION}"
  echo "  Image   : ${IMAGE}"
  echo "============================================================"
  echo ""

  check_prerequisites
  build_and_push
  deploy
  post_deploy

  info "Done 🎉"
}

main "$@"
