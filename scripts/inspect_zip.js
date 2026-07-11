import { readFileSync } from 'fs';

function inspectZip(filepath) {
  const buf = readFileSync(filepath);
  console.log(`\n=== ${filepath} (${buf.length} bytes) ===`);
  const entries = [];
  for (let i = 0; i < buf.length - 30; i++) {
    if (buf[i]===0x50 && buf[i+1]===0x4b && buf[i+2]===0x03 && buf[i+3]===0x04) {
      const method = buf.readUInt16LE(i+8);
      const compSize = buf.readUInt32LE(i+18);
      const uncompSize = buf.readUInt32LE(i+22);
      const fnLen = buf.readUInt16LE(i+26);
      const extraLen = buf.readUInt16LE(i+28);
      const fn = buf.slice(i+30, i+30+fnLen).toString();
      const dataStart = i + 30 + fnLen + extraLen;
      const available = Math.min(compSize, buf.length - dataStart);
      entries.push({ fn, method, compSize, uncompSize, dataStart, available });
      i += 30 + fnLen + extraLen + compSize - 1;
    }
  }
  entries.forEach(e => {
    const pct = e.compSize > 0 ? Math.round(e.available/e.compSize*100) : 0;
    console.log(`  ${e.fn}: comp=${e.compSize} uncomp=${e.uncompSize} avail=${e.available} (${pct}%)`);
  });
}

const files = [
  'docs/Concreter.Slab_2024.docx',
  'docs/Checklist_-_Demolition.docx',
  'docs/Elevated_Work_Platform_2024.docx',
  'docs/Landscaping___Maintenance_2024.docx',
  'docs/Painting_Internal_External_2024.docx',
];

files.forEach(inspectZip);
