# Skill: Deployment (GCP Cloud Run + Supabase)

## Description

This skill covers deployment procedures for the Bizarre Cafe platform on Google Cloud Platform
(GCP) Cloud Run with Supabase as the database backend. It includes one-time setup and
per-deployment steps.

## Key Concepts

- **GCP Cloud Run**: Serverless container deployment for the Hono app
- **Supabase**: PostgreSQL database with real-time subscriptions via Supabase
- **Cloud Run Configuration**: Concurrency, memory, CPU, and scaling settings
- **Supabase Schema**: Database schema deployment via migration scripts

## Rules

1. Always deploy to Cloud Run with least-privilege IAM roles
2. Use Cloud Run environment variables, not hard-coded secrets
3. Run Supabase migrations before deploying new code versions
4. Use Cloud Run health checks for deployment validation
5. Set concurrency and memory based on expected load

## File Paths

- `scripts/deploy-gcp.sh` — GCP Cloud Run deployment script
- `scripts/deploy-gcp-setup.sh` — One-time GCP infrastructure setup
- `scripts/setup-supabase.sh` — Supabase schema deployment
- `Dockerfile` — Production Docker image
- `.env.example` — Required environment variables
