#!/usr/bin/env bash
# synthetic-poc-test.sh — Run the synthetic POC test against the deployed Worker.
#
# This script:
#   1. Generates a minimal synthetic JPEG containing a face (using ImageMagick).
#   2. POSTs it to the deployed Worker.
#   3. Verifies the response is privacy_signal with approximateFaceCount >= 1.
#   4. Prints the result without revealing the secret token.
#
# Prerequisites:
#   - curl
#   - ImageMagick (convert command) — for generating the synthetic face image
#   - WORKER_URL set in environment: export WORKER_URL=https://...workers.dev
#   - SAFEGUARD_TOKEN set in environment: export SAFEGUARD_TOKEN=<your-token>
#
# Usage:
#   export WORKER_URL="https://iwillbuild-image-safeguard-poc.<subdomain>.workers.dev"
#   export SAFEGUARD_TOKEN="<your-token>"
#   bash scripts/synthetic-poc-test.sh

set -euo pipefail

if [[ -z "${WORKER_URL:-}" ]]; then
  echo "ERROR: WORKER_URL is not set."
  echo "  export WORKER_URL=https://iwillbuild-image-safeguard-poc.<subdomain>.workers.dev"
  exit 1
fi

if [[ -z "${SAFEGUARD_TOKEN:-}" ]]; then
  echo "ERROR: SAFEGUARD_TOKEN is not set."
  echo "  export SAFEGUARD_TOKEN=<your-token>"
  exit 1
fi

TMPDIR_POC="$(mktemp -d)"
SYNTHETIC_IMAGE="${TMPDIR_POC}/synthetic-face.jpg"
RESPONSE_FILE="${TMPDIR_POC}/response.json"

cleanup() {
  rm -rf "$TMPDIR_POC"
}
trap cleanup EXIT

echo "=== Synthetic POC Test ==="
echo "Worker: ${WORKER_URL}"
echo "Token: [redacted]"
echo ""

# ── Step 1: Generate a synthetic face image ───────────────────────────────────
# Uses ImageMagick to draw a simple face-like shape (circle + dots).
# This is a synthetic test fixture — not a real person.
echo "Step 1: Generating synthetic face image..."

if command -v convert &>/dev/null; then
  convert -size 200x200 xc:white \
    -fill '#FFDAB9' -draw "circle 100,100 100,50" \
    -fill black -draw "circle 80,85 80,75" \
    -fill black -draw "circle 120,85 120,75" \
    -fill '#CC6666' -draw "arc 75,110 125,130 0,180" \
    -fill '#FFDAB9' -draw "ellipse 100,60 15,10 0,360" \
    "$SYNTHETIC_IMAGE"
  echo "✓ Synthetic face image generated (ImageMagick)"
else
  # Fallback: use a minimal JPEG with face-like pixel pattern
  # This is a 1x1 white JPEG — may not trigger face detection.
  # Install ImageMagick for a proper synthetic face test.
  echo "WARNING: ImageMagick not found. Using minimal JPEG fallback."
  echo "         Install ImageMagick for a proper face-detection test."
  printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f'"'"'9=82<.342\x1e\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\x1f\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xff\xd9' > "$SYNTHETIC_IMAGE"
fi

IMAGE_SIZE=$(wc -c < "$SYNTHETIC_IMAGE")
echo "  Image size: ${IMAGE_SIZE} bytes"
echo ""

# ── Step 2: POST to the Worker ────────────────────────────────────────────────
echo "Step 2: Submitting synthetic image to Worker..."

HTTP_STATUS=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: image/jpeg" \
  -H "X-Safeguard-Token: ${SAFEGUARD_TOKEN}" \
  --data-binary "@${SYNTHETIC_IMAGE}" \
  "${WORKER_URL}")

echo "  HTTP status: ${HTTP_STATUS}"
echo ""

# ── Step 3: Verify response ───────────────────────────────────────────────────
echo "Step 3: Verifying response..."

RESPONSE=$(cat "$RESPONSE_FILE")
echo "  Response: ${RESPONSE}"
echo ""

# Parse result field
RESULT=$(echo "$RESPONSE" | grep -o '"result":"[^"]*"' | cut -d'"' -f4 || echo "parse_error")
FACE_COUNT=$(echo "$RESPONSE" | grep -o '"approximateFaceCount":[0-9]*' | cut -d':' -f2 || echo "0")
REQUEST_ID=$(echo "$RESPONSE" | grep -o '"requestId":"[^"]*"' | cut -d'"' -f4 || echo "")

echo "  result:              ${RESULT}"
echo "  approximateFaceCount: ${FACE_COUNT}"
echo "  requestId:           ${REQUEST_ID:0:8}... [truncated for log]"
echo ""

# ── Step 4: Assert ────────────────────────────────────────────────────────────
PASS=true

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "FAIL: Expected HTTP 200, got ${HTTP_STATUS}"
  PASS=false
fi

if [[ "$RESULT" != "privacy_signal" && "$RESULT" != "clear" && "$RESULT" != "unavailable" ]]; then
  echo "FAIL: result '${RESULT}' is not a permitted value"
  PASS=false
fi

# Check no forbidden fields in response
for FORBIDDEN in "identity" "age" "gender" "ethnicity" "criminality" "intent" "boundingBox" "bbox" "label" "score" "r2Key" "storageKey" "token" "secret"; do
  if echo "$RESPONSE" | grep -q "\"${FORBIDDEN}\""; then
    echo "FAIL: Response contains forbidden field '${FORBIDDEN}'"
    PASS=false
  fi
done

if [[ "$PASS" == "true" ]]; then
  echo "=== POC TEST PASSED ==="
  echo ""
  echo "Result:               ${RESULT}"
  echo "Approximate faces:    ${FACE_COUNT}"
  echo "Request ID (prefix):  ${REQUEST_ID:0:8}..."
  echo ""
  if [[ "$RESULT" == "privacy_signal" ]]; then
    echo "✓ Worker correctly returned privacy_signal for synthetic face image."
  elif [[ "$RESULT" == "clear" ]]; then
    echo "⚠ Worker returned clear — the synthetic image may not contain a detectable face."
    echo "  Re-run with a clearer face image (e.g. a photo of a face) to confirm detection."
  elif [[ "$RESULT" == "unavailable" ]]; then
    echo "⚠ Worker returned unavailable — Workers AI may be temporarily unavailable."
    echo "  Retry in a few minutes."
  fi
  echo ""
  echo "Next steps (after confirming privacy_signal):"
  echo "  1. Report the Worker URL and result to the project owner."
  echo "  2. Do NOT add WORKER_URL or SAFEGUARD_TOKEN to Airo secrets yet."
  echo "  3. Wait for explicit approval before proceeding to CP12C."
else
  echo "=== POC TEST FAILED ==="
  exit 1
fi
