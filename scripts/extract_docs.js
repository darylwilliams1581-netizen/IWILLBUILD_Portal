import { readFileSync, writeFileSync } from 'fs';
import { inflateRawSync } from 'zlib';
const fs = { readFileSync, writeFileSync };
const zlib = { inflateRawSync };

function extractDocXml(filepath) {
  const buf = fs.readFileSync(filepath);
  for (let i = 0; i < buf.length - 30; i++) {
    if (buf[i]===0x50 && buf[i+1]===0x4b && buf[i+2]===0x03 && buf[i+3]===0x04) {
      const compSize = buf.readUInt32LE(i+18);
      const fnLen = buf.readUInt16LE(i+26);
      const extraLen = buf.readUInt16LE(i+28);
      const fn = buf.slice(i+30, i+30+fnLen).toString();
      const dataStart = i + 30 + fnLen + extraLen;
      if (fn === 'word/document.xml' && dataStart + compSize <= buf.length) {
        const compressed = buf.slice(dataStart, dataStart + compSize);
        try {
          const xml = zlib.inflateRawSync(compressed).toString('utf8');
          return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } catch(e) { return 'inflate error: ' + e.message; }
      }
      i += 30 + fnLen + extraLen - 1;
    }
  }
  return 'not found';
}

const files = [
  'docs/Bricklaying_2024.docx',
  'docs/Building_Inspection_2024.docx',
  'docs/Cabinets_Installation_2024.docx',
  'docs/Carpenter_Cladding_2024.docx',
  'docs/Carpenter_Fixing_2024.docx',
  'docs/Carpenter_Framing_2024.docx',
  'docs/Carpenter_Lockup_2024.docx',
  'docs/Ceramic_Tiling_2024.docx',
  'docs/Blank_Safe_Work_Method_Statement_2024.docx',
];

const out = {};
files.forEach(f => {
  const name = f.split('/').pop().replace('.docx','');
  out[name] = extractDocXml(f);
});
fs.writeFileSync('scripts/docx_texts.json', JSON.stringify(out));
console.log('done');
Object.entries(out).forEach(([k,v]) => {
  console.log('\n=== ' + k + ' ===');
  console.log(v.slice(0, 3000));
});
