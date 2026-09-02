#!/usr/bin/env bash
# generate-fixture.sh — Generate the synthetic face fixture for the POC test.
#
# Creates fixtures/synthetic-face.jpg using ImageMagick.
# This is a synthetic test fixture — not a real person.
# The Worker has no storage — submitted image data is not retained.
#
# Prerequisites:
#   - ImageMagick (convert command)
#
# Usage:
#   bash scripts/generate-fixture.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/../fixtures"
OUTPUT="${FIXTURES_DIR}/synthetic-face.jpg"

mkdir -p "$FIXTURES_DIR"

if ! command -v convert &>/dev/null; then
  echo "ERROR: ImageMagick 'convert' not found."
  echo "  Install: brew install imagemagick  (macOS)"
  echo "           apt-get install imagemagick  (Debian/Ubuntu)"
  exit 1
fi

echo "Generating synthetic face fixture..."

# Draw a simple face-like shape: oval head, two eyes, a mouth arc.
# This is a synthetic fixture — not a real person.
convert -size 300x300 xc:white \
  -fill '#FFDAB9' -draw "ellipse 150,155 90,110 0,360" \
  -fill '#FFDAB9' -draw "ellipse 150,70 30,20 0,360" \
  -fill black    -draw "circle 115,130 115,115" \
  -fill black    -draw "circle 185,130 185,115" \
  -fill '#CC6666' -draw "arc 110,165 190,195 0,180" \
  -quality 95 \
  "$OUTPUT"

SIZE=$(wc -c < "$OUTPUT")
echo "✓ Fixture written: ${OUTPUT} (${SIZE} bytes)"
echo ""
echo "Verify with:"
echo "  file ${OUTPUT}"
