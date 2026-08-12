// Brute force: scan for XML text runs in the binary
const fs = require('fs');
const buf = fs.readFileSync('docs/Camera_Viewport_Watermark_Implementation_Guide.docx');
const str = buf.toString('utf8', 0, buf.length);

// Look for w:t (Word text run) content — these contain the actual document text
const matches = [];
const re = /<w:t[^>]*>([^<]{2,})<\/w:t>/g;
let m;
while ((m = re.exec(str)) !== null) {
  matches.push(m[1].trim());
}
if (matches.length > 0) {
  console.log(matches.join(' '));
} else {
  // Try finding any XML-like content
  const xmlStart = str.indexOf('<?xml');
  if (xmlStart >= 0) {
    console.log('Found XML at', xmlStart);
    console.log(str.slice(xmlStart, xmlStart + 2000));
  } else {
    // Look for readable ASCII runs
    const ascii = str.replace(/[^\x20-\x7E\n]/g, ' ').replace(/ {3,}/g, '\n');
    const lines = ascii.split('\n').filter(l => l.trim().length > 30);
    console.log(lines.slice(0, 200).join('\n'));
  }
}
