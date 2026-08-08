#!/bin/bash
set -e

echo "Ensure AlgoKit LocalNet and vLLM are running!"
# Run `algokit localnet start` to spin up the local Algorand network if it isn't running.

echo "Starting Bizarre Cafe backend..."
npm run dev &
BACKEND_PID=$!

function cleanup {
  echo "Cleaning up backend process (PID $BACKEND_PID)..."
  kill $BACKEND_PID || true
}
trap cleanup EXIT

echo "Waiting for backend to start (3 seconds)..."
sleep 3

echo "Running test-agents.ts..."
npx tsx scripts/test-agents.ts
