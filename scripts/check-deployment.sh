#!/usr/bin/env bash
###############################################################################
# check-deployment.sh — Automated Health Check Validation for Bizarre Cafe
#
# Usage:
#   ./scripts/check-deployment.sh [DOMAIN_OR_URL]
#
# Examples:
#   ./scripts/check-deployment.sh bizarre-cafe.duckdns.org
#   ./scripts/check-deployment.sh https://bizarre-cafe.duckdns.org
#   DOMAIN=bizarre-cafe.duckdns.org ./scripts/check-deployment.sh
###############################################################################
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-bizarre-cafe.duckdns.org}}"

if [[ "$DOMAIN" =~ ^https?:// ]]; then
  TARGET_URL="${DOMAIN%/}/health"
else
  TARGET_URL="https://${DOMAIN%/}/health"
fi

echo "============================================================"
echo "  Bizarre Cafe Automated Deployment Healthcheck"
echo "  Target URL: ${TARGET_URL}"
echo "============================================================"

MAX_RETRIES=12
DELAY=5
SUCCESS=0

for ((i=1;i<=MAX_RETRIES;i++)); do
  echo "Attempt $i of $MAX_RETRIES: Checking ${TARGET_URL}..."
  HTTP_STATUS=$(curl -k -s --connect-timeout 5 --max-time 10 -o /dev/null -w "%{http_code}" "${TARGET_URL}" || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✓ Healthcheck succeeded with HTTP 200 OK!"
    SUCCESS=1
    break
  fi

  echo "  HTTP status: $HTTP_STATUS. Sleeping $DELAY seconds..."
  sleep $DELAY
done

if [ $SUCCESS -ne 1 ]; then
  echo "✗ Healthcheck failed after $MAX_RETRIES attempts."
  exit 1
fi

echo "============================================================"
echo "✓ Service is healthy and responsive!"
echo "============================================================"
