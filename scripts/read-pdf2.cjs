// Extract text from CID-encoded PDF by decoding CMap tables + content streams
const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync('public/data/airo.pdf');
const str = buf.toString('latin1');

// Step 1: Parse all CMap tables (begincmap...endcmap blocks)
// These map glyph IDs to Unicode codepoints
const cmaps = [];
const cmapRe = /begincmap([\s\S]*?)endcmap/g;
let cm;
while ((cm = cmapRe.exec(str)) !== null) {
  const block = cm[1];
  const map = {};
  // beginbfchar entries: <glyphId> <unicode>
  const bfcharRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
  let bf;
  while ((bf = bfcharRe.exec(block)) !== null) {
    const glyph = parseInt(bf[1], 16);
    const unicode = parseInt(bf[2], 16);
    map[glyph] = String.fromCodePoint(unicode);
  }
  cmaps.push(map);
}
process.stderr.write('CMaps found: ' + cmaps.length + ', sizes: ' + cmaps.map(m => Object.keys(m).length).join(',') + '\n');

// Step 2: Find all compressed content streams and try to decompress + decode
// Look for streams that contain text operators (Tj, TJ, Tf, etc.)
const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let sm;
let streamIdx = 0;
const allText = [];

while ((sm = streamRe.exec(str)) !== null) {
  const raw = sm[1];
  const rawBuf = Buffer.from(raw, 'latin1');
  
  let decoded = null;
  // Try zlib inflate (FlateDecode)
  try {
    decoded = zlib.inflateSync(rawBuf).toString('latin1');
  } catch(e1) {
    try {
      decoded = zlib.inflateRawSync(rawBuf).toString('latin1');
    } catch(e2) {
      // Not compressed or different encoding
    }
  }
  
  if (decoded && (decoded.includes('Tj') || decoded.includes('TJ') || decoded.includes('BT'))) {
    process.stderr.write('Stream ' + streamIdx + ': has text operators, len=' + decoded.length + '\n');
    
    // Extract text using all available CMaps
    // TJ operator: [<hex> num <hex> num ...] TJ
    const tjHexRe = /\[([^\]]*)\]\s*TJ/g;
    let tj;
    while ((tj = tjHexRe.exec(decoded)) !== null) {
      const inner = tj[1];
      // Extract hex strings <...>
      const hexRe = /<([0-9A-Fa-f]+)>/g;
      let hx;
      let word = '';
      while ((hx = hexRe.exec(inner)) !== null) {
        const hexStr = hx[1];
        // Process pairs of hex digits as glyph IDs (2 bytes each)
        for (let i = 0; i < hexStr.length; i += 4) {
          const glyphId = parseInt(hexStr.slice(i, i+4), 16);
          // Try each CMap
          let found = false;
          for (const cmap of cmaps) {
            if (cmap[glyphId]) { word += cmap[glyphId]; found = true; break; }
          }
          if (!found && glyphId > 0) word += '?';
        }
      }
      if (word.trim()) allText.push(word.trim());
    }
    
    // Tj operator: (string) Tj  - may be raw bytes
    const tjRawRe = /\(([^)]*)\)\s*Tj/g;
    let tjr;
    while ((tjr = tjRawRe.exec(decoded)) !== null) {
      const raw2 = tjr[1];
      if (raw2.trim()) allText.push(raw2.trim());
    }
  }
  streamIdx++;
}

console.log('=== EXTRACTED TEXT ===');
console.log(allText.join('\n'));
