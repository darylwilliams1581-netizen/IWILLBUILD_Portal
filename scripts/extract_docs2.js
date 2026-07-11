import { readFileSync, writeFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

function extractDocXml(filepath) {
  const buf = readFileSync(filepath);
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
          const xml = inflateRawSync(compressed).toString('utf8');
          return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } catch(e) { return 'inflate error: ' + e.message; }
      }
      i += 30 + fnLen + extraLen - 1;
    }
  }
  return 'not found';
}

const files = [
  'docs/Concreter.Slab_2024.docx',
  'docs/Checklist_-_Demolition.docx',
  'docs/Elevated_Work_Platform_2024.docx',
  'docs/Landscaping___Maintenance_2024.docx',
  'docs/Painting_Internal_External_2024.docx',
];

files.forEach(f => {
  const name = f.split('/').pop().replace('.docx','');
  const text = extractDocXml(f);
  console.log('\n=== ' + name + ' ===');
  console.log('Length:', text.length);
  console.log(text.slice(0, 5000));
});
