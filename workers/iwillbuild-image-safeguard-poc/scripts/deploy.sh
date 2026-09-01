#!/usr/bin/env bash
# deploy.sh — Deploy the iwillbuild-image-safeguard-poc Worker.
#
# Prerequisites:
#   - wrangler installed and authenticated (wrangler login)
#   - CLOUDFLARE_ACCOUNT_ID set in environment or wrangler.toml
#
# Usage:
#   cd workers/iwillbuild-image-safeguard-poc
#   npm install
#   bash scripts/deploy.sh
#
# The script will:
#   1. Run local tests (must pass before deploy)
#   2. Deploy the Worker
#   3. Prompt to set the SAFEGUARD_TOKEN secret
#   4. Print the Worker URL

set -euo pipefail

WORKER_NAME="iwillbuild-image-safeguard-poc"

echo "=== Step 1: Run local tests ==="
npm test
echo "✓ Local tests passed"

echo ""
echo "=== Step 2: Deploy Worker ==="
npx wrangler deploy
echo "✓ Worker deployed"

echo ""
echo "=== Step 3: Set SAFEGUARD_TOKEN secret ==="
echo "You will be prompted to enter the secret value."
echo "Generate a strong random token, e.g.:"
echo "  openssl rand -hex 32"
echo ""
npx wrangler secret put SAFEGUARD_TOKEN --name "$WORKER_NAME"
echo "✓ SAFEGUARD_TOKEN secret set"

echo ""
echo "=== Deploy complete ==="
echo "Worker URL: https://${WORKER_NAME}.<your-subdomain>.workers.dev"
echo ""
echo "Next step: run scripts/synthetic-poc-test.sh to verify the Worker."
echo "Do NOT add the Worker URL or secret to Airo until the POC test passes."
