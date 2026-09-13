#!/usr/bin/env bash
###############################################################################
# deploy-gcp-setup.sh — One-time GCP infrastructure provisioning for bizarre-cafe
#
# Usage:
#   ./scripts/deploy-gcp-setup.sh [PROJECT_ID]
#
# Creates all required GCP resources before running deploy-gcp.sh.
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REGION="${GCP_REGION:-us-central1}"

# Default project — can be overridden on the command line
PROJECT_ID="${1:-}"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m▶\033[0m $*"; }
info() { echo -e "\033[1;32m✓\033[0m $*"; }
warn() { echo -e "\033[1;33m⚠\033[0m $*" >&2; }
err()  { echo -e "\033[1;31m✗\033[0m $*" >&2; }
die()  { err "$@"; exit 1; }

# ── 1. Set / verify GCP project ─────────────────────────────────────────────
setup_project() {
  log "Setting up GCP project..."

  if [[ -z "$PROJECT_ID" ]]; then
    read -r -p "Enter GCP Project ID: " PROJECT_ID
  fi

  if [[ -z "$PROJECT_ID" ]]; then
    die "Project ID is required."
  fi

  gcloud config set project "$PROJECT_ID"
  info "GCP project set to: ${PROJECT_ID}"
}

# ── 2. Enable required APIs ────────────────────────────────────────────────
enable_apis() {
  log "Enabling required APIs..."

  local apis=(
    "run.googleapis.com"
    "sqladmin.googleapis.com"
    "storage.googleapis.com"
    "cloudbuild.googleapis.com"
    "secretmanager.googleapis.com"
    "compute.googleapis.com"
  )

  for api in "${apis[@]}"; do
    log "  Enabling ${api}..."
    gcloud services enable "$api" 2>&1 || warn "  Failed to enable ${api}"
  done

  info "All APIs enabled."
}

# ── 2b. Setup runtime service account & IAM least-privilege roles ───────────
setup_service_account() {
  local sa_name="bizarre-cafe-runner"
  local sa_email="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"

  log "Setting up runtime service account: ${sa_email}..."

  if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null; then
    warn "Service account '${sa_email}' already exists — skipping creation."
  else
    gcloud iam service-accounts create "$sa_name" \
      --description="Dedicated least-privilege runtime service account for Bizarre Cafe" \
      --display-name="Bizarre Cafe Runner" \
      --project="$PROJECT_ID" 2>&1 || die "Failed to create service account"
    info "Service account created: ${sa_email}"
  fi

  log "Binding least-privilege IAM roles to ${sa_email}..."
  local roles=(
    "roles/secretmanager.secretAccessor"
    "roles/cloudsql.client"
    "roles/storage.objectViewer"
    "roles/logging.logWriter"
    "roles/monitoring.metricWriter"
  )

  for role in "${roles[@]}"; do
    log "  Assigning role: ${role}..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${sa_email}" \
      --role="$role" \
      --condition=None \
      --quiet &>/dev/null || warn "  Failed to assign ${role}"
  done

  info "IAM roles successfully bound to ${sa_email}."
}

# ── 3. Create Cloud SQL PostgreSQL instance ──────────────────────────────────
create_cloudsql() {
  local instance_name="bizarre-cafe-db"
  local db_name="bizarre_cafe"

  log "Creating Cloud SQL PostgreSQL instance..."

  if gcloud sql instances describe "$instance_name" 2>/dev/null; then
    warn "Instance '${instance_name}' already exists — skipping creation."
  else
    gcloud sql instances create "$instance_name" \
      --database-version=POSTGRES_16 \
      --tier=db-f1-micro \
      --region="${REGION}" \
      --root-password="${DB_ROOT_PASSWORD:-$(openssl rand -base64 16)}" \
      2>&1 || die "Failed to create Cloud SQL instance"

    info "Cloud SQL instance created: ${instance_name}"
  fi

  # Create database
  gcloud sql databases create "$db_name" \
    --instance="$instance_name" 2>/dev/null || warn "  Database '${db_name}' may already exist."

  info "Database '${db_name}' ready on instance '${instance_name}'."

  # Print connection info
  local conn_name
  conn_name="$(gcloud sql instances describe "$instance_name" --format='value(connectionName)')"
  info "Connection name: ${conn_name}"
  echo ""
  echo "  Use this in your DATABASE_URL:"
  echo "  postgres://postgres:<root-password>@/bizarre_cafe?host=/cloudsql/${conn_name}"
  echo ""
}

# ── 4. Create Cloud Storage bucket ──────────────────────────────────────────
create_storage_bucket() {
  local bucket_name="${PROJECT_ID}-collectibles"

  log "Creating Cloud Storage bucket..."

  if gsutil ls "gs://${bucket_name}/" &>/dev/null 2>&1; then
    warn "Bucket '${bucket_name}' already exists — skipping."
  else
    gsutil mb -l "$REGION" "gs://${bucket_name}" 2>&1 \
      || die "Failed to create bucket"
    info "Bucket created: gs://${bucket_name}"
  fi

  # Set object retention / lifecycle if desired — future enhancement
  info "Cloud Storage bucket ready for collectibles/images."
}

# ── 5. Set up secrets in Secret Manager ─────────────────────────────────────
setup_secrets() {
  log "Setting up secrets in Secret Manager..."

  local secrets=(
    "JWT_SECRET"
    "SUPABASE_URL"
    "SUPABASE_SERVICE_KEY"
    "ALGORAND_NETWORK"
    "ALGORAND_ALGOD_TOKEN"
    "OPENAI_API_KEY"
    "X402_CONFIG"
  )

  for secret_name in "${secrets[@]}"; do
    # Create secret if it doesn't exist
    gcloud secrets describe "$secret_name" 2>/dev/null \
      || gcloud secrets create "$secret_name" 2>&1 \
      || warn "  Could not create secret: ${secret_name}"

    # Prompt for value (skip if already set and user opts to skip)
    local value
    read -r -s -p "Enter value for ${secret_name} (empty to skip): " value 2>/dev/null || true

    if [[ -n "$value" ]]; then
      echo "$value" | gcloud secrets versions add "$secret_name" --data-file=- 2>&1 \
        || warn "  Could not add secret version for: ${secret_name}"
      info "Secret '${secret_name}' stored."
    else
      warn "  Skipped secret: ${secret_name}"
    fi
  done
}

# ── 6. Create Cloud Run service skeleton (optional — deploy-gcp.sh does this) ─
create_cloudrun_service() {
  log "Cloud Run service will be created by deploy-gcp.sh."
  info "Skipping manual service creation — deployment script handles it."
}

# ── 7. Connect Cloud Run to Cloud SQL (future reference) ────────────────────
configure_cloudrun_sql() {
  local instance_name="bizarre-cafe-db"

  log "Cloud Run → Cloud SQL connection setup:"
  echo ""
  echo "  After deploy-gcp.sh runs, connect Cloud Run to Cloud SQL:"
  echo ""
  echo "  gcloud run services update ${SERVICE_NAME:-bizarre-cafe} \\"
  echo "    --region ${REGION} \\"
  echo "    --add-cloudsql-instances=${instance_name}"
  echo ""
  warn "  Run this command after the first Cloud Run deployment."
}

# ── 8. Run the app (delegate to deploy-gcp.sh) ──────────────────────────────
run_deployment() {
  log "Infrastructure setup complete."
  echo ""
  echo "  Next step: run the deployment script to build and deploy:"
  echo ""
  echo "    cd ${PROJECT_DIR}"
  echo "    ./scripts/deploy-gcp.sh"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo "============================================================"
  echo "  bizarre-cafe GCP Infrastructure Setup"
  echo "  Region  : ${REGION}"
  echo "============================================================"
  echo ""

  setup_project
  enable_apis
  setup_service_account
  create_cloudsql
  create_storage_bucket
  setup_secrets
  create_cloudrun_service
  configure_cloudrun_sql

  echo ""
  echo "============================================================"
  info "Infrastructure provisioning complete! 🎉"
  echo "============================================================"
  echo ""
  run_deployment
}

main "$@"
