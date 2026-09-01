#!/usr/bin/env node
/**
 * generate-fixture-node.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates fixtures/synthetic-face.jpg without ImageMagick.
 *
 * Produces a valid 200×200 JPEG containing a face-like arrangement of
 * filled circles (head oval, two eye circles, mouth arc) encoded as raw
 * RGB pixel data wrapped in a minimal JFIF/JPEG bitstream.
 *
 * This is a synthetic test fixture — not a real person.
 * The Worker has no storage — submitted image data is not retained.
 *
 * Usage:
 *   node scripts/generate-fixture-node.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const OUTPUT = join(FIXTURES_DIR, 'synthetic-face.jpg');

const W = 200;
const H = 200;

// ── Draw face-like geometry into an RGB pixel buffer ─────────────────────────

const pixels = new Uint8Array(W * H * 3).fill(255); // white background

function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
}

function fillEllipse(cx, cy, rx, ry, r, g, b) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(x, y, r, g, b);
    }
  }
}

function fillCircle(cx, cy, radius, r, g, b) {
  fillEllipse(cx, cy, radius, radius, r, g, b);
}

// Skin tone: #FFDAB9 = 255, 218, 185
const SKIN = [255, 218, 185];
// Black: 0, 0, 0
const BLACK = [0, 0, 0];
// Mouth: #CC6666 = 204, 102, 102
const MOUTH = [204, 102, 102];

// Head (large oval)
fillEllipse(100, 105, 70, 85, ...SKIN);
// Forehead bump
fillEllipse(100, 40, 25, 18, ...SKIN);
// Left eye
fillCircle(75, 90, 12, ...BLACK);
// Right eye
fillCircle(125, 90, 12, ...BLACK);
// Mouth arc (filled rectangle approximation)
for (let x = 70; x <= 130; x++) {
  for (let y = 120; y <= 130; y++) {
    const dx = x - 100;
    const dy = y - 110;
    // Ellipse arc: only lower half
    if (dx * dx / 900 + dy * dy / 400 <= 1 && dy >= 0) {
      setPixel(x, y, ...MOUTH);
    }
  }
}

// ── Encode as JPEG ────────────────────────────────────────────────────────────
// Uses a minimal JPEG encoder: standard quantisation tables, Huffman tables,
// and a valid JFIF APP0 header. Produces a real decodable JPEG.

function writeUint16BE(buf, offset, value) {
  buf[offset] = (value >> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

// Standard luminance quantisation table (quality ~75)
const LUMA_QUANT = new Uint8Array([
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
]);

// Standard chrominance quantisation table
const CHROMA_QUANT = new Uint8Array([
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
]);

// Rather than implementing a full DCT JPEG encoder (which is hundreds of lines),
// we use the well-known "raw JPEG" technique: embed the pixel data in a JPEG
// container using the JPEG lossless (SOF3) path with a trivial Huffman table,
// or more practically, use the libjpeg-compatible approach of writing a
// baseline JPEG with identity quantisation.
//
// For the POC fixture we only need:
//   1. Valid JPEG magic bytes (FF D8 FF)
//   2. A real JFIF APP0 header
//   3. A SOF0 marker with correct W×H dimensions
//   4. Enough valid structure that the Worker's structural validator passes
//   5. Enough pixel content that Workers AI can attempt face detection
//
// We implement a minimal but complete baseline JPEG encoder below.
// This is ~200 lines but produces a real, decodable JPEG.

// ── DCT (8×8 block) ───────────────────────────────────────────────────────────

function dct8(block) {
  // 1D DCT-II on 8 elements, in-place
  const N = 8;
  const out = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += block[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    out[k] = sum;
  }
  return out;
}

function dct2d(block8x8) {
  // 2D DCT: apply 1D DCT to each row, then each column
  const tmp = new Float64Array(64);
  // Rows
  for (let r = 0; r < 8; r++) {
    const row = block8x8.slice(r * 8, r * 8 + 8);
    const d = dct8(row);
    for (let c = 0; c < 8; c++) tmp[r * 8 + c] = d[c];
  }
  // Columns
  const out = new Float64Array(64);
  for (let c = 0; c < 8; c++) {
    const col = new Float64Array(8);
    for (let r = 0; r < 8; r++) col[r] = tmp[r * 8 + c];
    const d = dct8(col);
    for (let r = 0; r < 8; r++) out[r * 8 + c] = d[r];
  }
  return out;
}

// ── Quantise ──────────────────────────────────────────────────────────────────

// Zigzag order for 8×8 block
const ZIGZAG = [
   0,  1,  8, 16,  9,  2,  3, 10,
  17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

function quantiseBlock(dctBlock, qtable) {
  const out = new Int16Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = Math.round(dctBlock[ZIGZAG[i]] / qtable[i]);
  }
  return out;
}

// ── Standard Huffman tables (from JPEG spec) ──────────────────────────────────

// DC luma
const DC_LUMA_BITS  = [0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0];
const DC_LUMA_VALS  = [0,1,2,3,4,5,6,7,8,9,10,11];
// DC chroma
const DC_CHROMA_BITS = [0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0];
const DC_CHROMA_VALS = [0,1,2,3,4,5,6,7,8,9,10,11];
// AC luma
const AC_LUMA_BITS  = [0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,125];
const AC_LUMA_VALS  = [
  0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,
  0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,0x23,0x42,0xb1,0xc1,0x15,0x52,
  0xd1,0xf0,0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,0x17,0x18,0x19,0x1a,0x25,
  0x26,0x27,0x28,0x29,0x2a,0x34,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,
  0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,0x64,
  0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x83,
  0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,
  0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,
  0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,
  0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,
  0xe9,0xea,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa,
];
// AC chroma
const AC_CHROMA_BITS = [0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,119];
const AC_CHROMA_VALS = [
  0x00,0x01,0x02,0x03,0x11,0x04,0x05,0x21,0x31,0x06,0x12,0x41,0x51,0x07,0x61,
  0x71,0x13,0x22,0x32,0x81,0x08,0x14,0x42,0x91,0xa1,0xb1,0xc1,0x09,0x23,0x33,
  0x52,0xf0,0x15,0x62,0x72,0xd1,0x0a,0x16,0x24,0x34,0xe1,0x25,0xf1,0x17,0x18,
  0x19,0x1a,0x26,0x27,0x28,0x29,0x2a,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,
  0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,
  0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,
  0x82,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,
  0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,
  0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,
  0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,
  0xe8,0xe9,0xea,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa,
];

// Build code table from bits + vals arrays
function buildHuffTable(bits, vals) {
  const table = new Map();
  let code = 0;
  let vi = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) {
      table.set(vals[vi++], { code, len });
      code++;
    }
    code <<= 1;
  }
  return table;
}

const HT_DC_LUMA   = buildHuffTable(DC_LUMA_BITS,   DC_LUMA_VALS);
const HT_DC_CHROMA = buildHuffTable(DC_CHROMA_BITS,  DC_CHROMA_VALS);
const HT_AC_LUMA   = buildHuffTable(AC_LUMA_BITS,   AC_LUMA_VALS);
const HT_AC_CHROMA = buildHuffTable(AC_CHROMA_BITS,  AC_CHROMA_VALS);

// ── Bit writer ────────────────────────────────────────────────────────────────

class BitWriter {
  constructor() {
    this.buf = [];
    this.bits = 0;
    this.nbits = 0;
  }
  writeBits(code, len) {
    this.bits = (this.bits << len) | (code & ((1 << len) - 1));
    this.nbits += len;
    while (this.nbits >= 8) {
      this.nbits -= 8;
      const byte = (this.bits >> this.nbits) & 0xff;
      this.buf.push(byte);
      if (byte === 0xff) this.buf.push(0x00); // byte stuffing
    }
  }
  flush() {
    if (this.nbits > 0) {
      const byte = (this.bits << (8 - this.nbits)) & 0xff;
      this.buf.push(byte);
      if (byte === 0xff) this.buf.push(0x00);
    }
  }
  toUint8Array() {
    return new Uint8Array(this.buf);
  }
}

// ── Encode a coefficient value ────────────────────────────────────────────────

function encodeCoeff(bw, htDC, htAC, coeffs, prevDC) {
  // DC coefficient
  const dc = coeffs[0] - prevDC;
  const dcCat = dc === 0 ? 0 : Math.floor(Math.log2(Math.abs(dc))) + 1;
  const dcEntry = htDC.get(dcCat);
  if (!dcEntry) throw new Error(`No DC Huffman entry for category ${dcCat}`);
  bw.writeBits(dcEntry.code, dcEntry.len);
  if (dcCat > 0) {
    const dcVal = dc > 0 ? dc : dc + (1 << dcCat) - 1;
    bw.writeBits(dcVal, dcCat);
  }

  // AC coefficients
  let zeroRun = 0;
  for (let k = 1; k < 64; k++) {
    const ac = coeffs[k];
    if (ac === 0) {
      if (k === 63) {
        const eob = htAC.get(0x00);
        bw.writeBits(eob.code, eob.len);
        break;
      }
      zeroRun++;
      if (zeroRun === 16) {
        const zrl = htAC.get(0xf0);
        bw.writeBits(zrl.code, zrl.len);
        zeroRun = 0;
      }
    } else {
      const acCat = Math.floor(Math.log2(Math.abs(ac))) + 1;
      const sym = (zeroRun << 4) | acCat;
      const acEntry = htAC.get(sym);
      if (!acEntry) {
        // Fall back to ZRL + retry
        zeroRun = 0;
        k--;
        continue;
      }
      bw.writeBits(acEntry.code, acEntry.len);
      const acVal = ac > 0 ? ac : ac + (1 << acCat) - 1;
      bw.writeBits(acVal, acCat);
      zeroRun = 0;
    }
  }
  return coeffs[0]; // return new DC predictor
}

// ── RGB → YCbCr ──────────────────────────────────────────────────────────────

function rgbToYCbCr(r, g, b) {
  const y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
  const cr =  0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  return [y, cb, cr];
}

// ── Extract 8×8 block from channel plane ─────────────────────────────────────

function extractBlock(plane, bx, by, w, h) {
  const block = new Float64Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const px = Math.min(bx * 8 + c, w - 1);
      const py = Math.min(by * 8 + r, h - 1);
      block[r * 8 + c] = plane[py * w + px] - 128;
    }
  }
  return block;
}

// ── Build channel planes ──────────────────────────────────────────────────────

const yPlane  = new Float64Array(W * H);
const cbPlane = new Float64Array(W * H);
const crPlane = new Float64Array(W * H);

for (let i = 0; i < W * H; i++) {
  const r = pixels[i * 3];
  const g = pixels[i * 3 + 1];
  const b = pixels[i * 3 + 2];
  const [y, cb, cr] = rgbToYCbCr(r, g, b);
  yPlane[i]  = y;
  cbPlane[i] = cb;
  crPlane[i] = cr;
}

// ── Encode scan data ──────────────────────────────────────────────────────────

const bw = new BitWriter();
const blocksX = Math.ceil(W / 8);
const blocksY = Math.ceil(H / 8);

let prevDC_Y  = 0;
let prevDC_Cb = 0;
let prevDC_Cr = 0;

for (let by = 0; by < blocksY; by++) {
  for (let bx = 0; bx < blocksX; bx++) {
    // Y
    const yBlock  = extractBlock(yPlane,  bx, by, W, H);
    const cbBlock = extractBlock(cbPlane, bx, by, W, H);
    const crBlock = extractBlock(crPlane, bx, by, W, H);

    const yDct  = dct2d(yBlock);
    const cbDct = dct2d(cbBlock);
    const crDct = dct2d(crBlock);

    const yQ  = quantiseBlock(yDct,  LUMA_QUANT);
    const cbQ = quantiseBlock(cbDct, CHROMA_QUANT);
    const crQ = quantiseBlock(crDct, CHROMA_QUANT);

    prevDC_Y  = encodeCoeff(bw, HT_DC_LUMA,   HT_AC_LUMA,   yQ,  prevDC_Y);
    prevDC_Cb = encodeCoeff(bw, HT_DC_CHROMA, HT_AC_CHROMA, cbQ, prevDC_Cb);
    prevDC_Cr = encodeCoeff(bw, HT_DC_CHROMA, HT_AC_CHROMA, crQ, prevDC_Cr);
  }
}
bw.flush();
const scanData = bw.toUint8Array();

// ── Assemble JPEG segments ────────────────────────────────────────────────────

function seg(marker, data) {
  const len = data.length + 2;
  const out = new Uint8Array(2 + 2 + data.length);
  out[0] = 0xff; out[1] = marker;
  out[2] = (len >> 8) & 0xff; out[3] = len & 0xff;
  out.set(data, 4);
  return out;
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// APP0 (JFIF)
const app0 = seg(0xe0, new Uint8Array([
  0x4a,0x46,0x49,0x46,0x00, // JFIF\0
  0x01,0x01,                 // version 1.1
  0x00,                      // aspect ratio units: 0=no units
  0x00,0x01,0x00,0x01,       // Xdensity=1, Ydensity=1
  0x00,0x00,                 // no thumbnail
]));

// DQT — luma
const dqt0 = seg(0xdb, concat(new Uint8Array([0x00]), LUMA_QUANT));
// DQT — chroma
const dqt1 = seg(0xdb, concat(new Uint8Array([0x01]), CHROMA_QUANT));

// SOF0 (baseline DCT, 3 components, YCbCr 4:4:4)
const sof0Data = new Uint8Array([
  0x08,                      // precision = 8
  (H >> 8) & 0xff, H & 0xff, // height
  (W >> 8) & 0xff, W & 0xff, // width
  0x03,                      // 3 components
  0x01, 0x11, 0x00,          // Y:  id=1, sampling=1×1, qtable=0
  0x02, 0x11, 0x01,          // Cb: id=2, sampling=1×1, qtable=1
  0x03, 0x11, 0x01,          // Cr: id=3, sampling=1×1, qtable=1
]);
const sof0 = seg(0xc0, sof0Data);

// DHT — DC luma
function buildDhtSegment(tcth, bits, vals) {
  return seg(0xc4, concat(new Uint8Array([tcth]), new Uint8Array(bits), new Uint8Array(vals)));
}
const dht_dc_luma   = buildDhtSegment(0x00, DC_LUMA_BITS,   DC_LUMA_VALS);
const dht_ac_luma   = buildDhtSegment(0x10, AC_LUMA_BITS,   AC_LUMA_VALS);
const dht_dc_chroma = buildDhtSegment(0x01, DC_CHROMA_BITS, DC_CHROMA_VALS);
const dht_ac_chroma = buildDhtSegment(0x11, AC_CHROMA_BITS, AC_CHROMA_VALS);

// SOS header
const sosHeader = seg(0xda, new Uint8Array([
  0x03,             // 3 components
  0x01, 0x00,       // Y:  DC=0, AC=0
  0x02, 0x11,       // Cb: DC=1, AC=1
  0x03, 0x11,       // Cr: DC=1, AC=1
  0x00, 0x3f, 0x00, // Ss=0, Se=63, Ah=0, Al=0
]));

// SOI + segments + SOS + scan data + EOI
const soi = new Uint8Array([0xff, 0xd8]);
const eoi = new Uint8Array([0xff, 0xd9]);

const jpeg = concat(
  soi, app0,
  dqt0, dqt1,
  sof0,
  dht_dc_luma, dht_ac_luma, dht_dc_chroma, dht_ac_chroma,
  sosHeader, scanData,
  eoi,
);

// ── Write output ──────────────────────────────────────────────────────────────

mkdirSync(FIXTURES_DIR, { recursive: true });
writeFileSync(OUTPUT, jpeg);

console.log(`✓ Fixture written: ${OUTPUT} (${jpeg.length} bytes)`);
console.log(`  Dimensions: ${W}×${H} px`);
console.log(`  Magic bytes: ${jpeg[0].toString(16).padStart(2,'0')} ${jpeg[1].toString(16).padStart(2,'0')} ${jpeg[2].toString(16).padStart(2,'0')} (JPEG)`);
