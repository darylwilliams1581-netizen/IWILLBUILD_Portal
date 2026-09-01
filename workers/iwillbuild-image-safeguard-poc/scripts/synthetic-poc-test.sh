#!/usr/bin/env bash
# synthetic-poc-test.sh — Run the synthetic POC test against the deployed Worker.
# CP12B4 — Corrected: uses Dazza contract fields, requires privacy_signal strictly,
#           uses included synthetic fixture, never prints the token.
#
# This script:
#   1. Uses the included synthetic face fixture (fixtures/synthetic-face.jpg).
#      Never downloads or uses a production/customer image.
#   2. POSTs the fixture to the deployed Worker.
#   3. FAILS unless result is exactly privacy_signal AND faceCount >= 1.
#   4. Verifies the response matches the Dazza contract (faceCount, detectorName,
#      detectorVersion, failureCode, requestId).
#   5. Never prints the authentication token.
#   6. The Worker has no storage — submitted image data is not retained.
#
# Prerequisites:
#   - curl
#   - WORKER_URL set in environment
#   - SAFEGUARD_TOKEN set in environment
#
# Usage:
#   export WORKER_URL="https://iwillbuild-image-safeguard-poc.<subdomain>.workers.dev"
#   export SAFEGUARD_TOKEN="<your-token>"
#   bash scripts/synthetic-poc-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="${SCRIPT_DIR}/../fixtures/synthetic-face.jpg"

if [[ -z "${WORKER_URL:-}" ]]; then
  echo "ERROR: WORKER_URL is not set."
  exit 1
fi

if [[ -z "${SAFEGUARD_TOKEN:-}" ]]; then
  echo "ERROR: SAFEGUARD_TOKEN is not set."
  exit 1
fi

# ── Verify fixture exists ─────────────────────────────────────────────────────
if [[ ! -f "$FIXTURE" ]]; then
  echo "ERROR: Synthetic face fixture not found at: ${FIXTURE}"
  echo "  Run: bash scripts/generate-fixture.sh"
  exit 1
fi

FIXTURE_SIZE=$(wc -c < "$FIXTURE")
if [[ "$FIXTURE_SIZE" -lt 1000 ]]; then
  echo "ERROR: Fixture is too small (${FIXTURE_SIZE} bytes). Re-generate it."
  exit 1
fi

TMPDIR_POC="$(mktemp -d)"
RESPONSE_FILE="${TMPDIR_POC}/response.json"

cleanup() {
  rm -rf "$TMPDIR_POC"
}
trap cleanup EXIT

echo "=== Synthetic POC Test ==="
echo "Worker:       ${WORKER_URL}"
echo "Token:        [redacted — never printed]"
echo "Fixture:      ${FIXTURE} (${FIXTURE_SIZE} bytes)"
echo ""

# ── POST to the Worker ────────────────────────────────────────────────────────
echo "Submitting synthetic fixture to Worker..."

HTTP_STATUS=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: image/jpeg" \
  -H "X-Safeguard-Token: ${SAFEGUARD_TOKEN}" \
  --data-binary "@${FIXTURE}" \
  "${WORKER_URL}")

echo "HTTP status: ${HTTP_STATUS}"
echo ""

# ── Parse response ────────────────────────────────────────────────────────────
RESPONSE=$(cat "$RESPONSE_FILE")

# Parse Dazza contract fields
RESULT=$(echo "$RESPONSE"       | grep -o '"result":"[^"]*"'          | cut -d'"' -f4  || echo "parse_error")
FACE_COUNT=$(echo "$RESPONSE"   | grep -o '"faceCount":[0-9]*'        | cut -d':' -f2  || echo "-1")
DETECTOR_NAME=$(echo "$RESPONSE"| grep -o '"detectorName":"[^"]*"'    | cut -d'"' -f4  || echo "")
DETECTOR_VER=$(echo "$RESPONSE" | grep -o '"detectorVersion":"[^"]*"' | cut -d'"' -f4  || echo "")
REQUEST_ID=$(echo "$RESPONSE"   | grep -o '"requestId":"[^"]*"'       | cut -d'"' -f4  || echo "")

echo "result:          ${RESULT}"
echo "faceCount:       ${FACE_COUNT}"
echo "detectorName:    ${DETECTOR_NAME}"
echo "detectorVersion: ${DETECTOR_VER}"
echo "requestId:       ${REQUEST_ID:0:8}... [truncated]"
echo ""

# ── Assertions ────────────────────────────────────────────────────────────────
PASS=true

# HTTP 200 required
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "FAIL: Expected HTTP 200, got ${HTTP_STATUS}"
  PASS=false
fi

# result must be exactly privacy_signal — clear/unavailable are failures here
if [[ "$RESULT" != "privacy_signal" ]]; then
  echo "FAIL: Expected result=privacy_signal, got '${RESULT}'"
  echo "      The synthetic face fixture must produce a face detection."
  if [[ "$RESULT" == "clear" ]]; then
    echo "      clear means no faces were detected — fixture may not be suitable."
  elif [[ "$RESULT" == "unavailable" ]]; then
    echo "      unavailable means Workers AI is not responding — retry later."
  fi
  PASS=false
fi

# faceCount must be >= 1
if [[ "$FACE_COUNT" -lt 1 ]] 2>/dev/null; then
  echo "FAIL: Expected faceCount >= 1, got ${FACE_COUNT}"
  PASS=false
fi

# detectorName must be present
if [[ -z "$DETECTOR_NAME" ]]; then
  echo "FAIL: detectorName is missing from response"
  PASS=false
fi

# detectorVersion must be present
if [[ -z "$DETECTOR_VER" ]]; then
  echo "FAIL: detectorVersion is missing from response"
  PASS=false
fi

# requestId must be present
if [[ -z "$REQUEST_ID" ]]; then
  echo "FAIL: requestId is missing from response"
  PASS=false
fi

# Response must not contain forbidden fields
for FORBIDDEN in \
  "approximateFaceCount" \
  "identity" "age" "gender" "ethnicity" "criminality" "intent" \
  "boundingBox" "bbox" "label" "score" "rawModel" "modelOutput" \
  "r2Key" "storageKey" "token" "secret"; do
  if echo "$RESPONSE" | grep -q "\"${FORBIDDEN}\""; then
    echo "FAIL: Response contains forbidden field '${FORBIDDEN}'"
    PASS=false
  fi
done

# ── Result ────────────────────────────────────────────────────────────────────
if [[ "$PASS" == "true" ]]; then
  echo "=== POC TEST PASSED ==="
  echo ""
  echo "  result:          ${RESULT}"
  echo "  faceCount:       ${FACE_COUNT}"
  echo "  detectorName:    ${DETECTOR_NAME}"
  echo "  detectorVersion: ${DETECTOR_VER}"
  echo "  requestId:       ${REQUEST_ID:0:8}..."
  echo ""
  echo "✓ Worker returned privacy_signal with faceCount >= 1 for synthetic fixture."
  echo "✓ Response matches Dazza contract (faceCount, detectorName, detectorVersion, failureCode, requestId)."
  echo "✓ No forbidden fields in response."
  echo "✓ Token was not printed."
  echo ""
  echo "Next steps:"
  echo "  1. Report the Worker URL and these results to the project owner."
  echo "  2. Do NOT add WORKER_URL or SAFEGUARD_TOKEN to Airo secrets yet."
  echo "  3. Wait for explicit approval before proceeding to CP12C."
else
  echo "=== POC TEST FAILED ==="
  exit 1
fi
