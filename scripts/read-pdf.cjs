const fs = require('fs');
const buf = fs.readFileSync('public/data/airo.pdf');
const str = buf.toString('latin1');

process.stderr.write('File size: ' + buf.length + '\n');
process.stderr.write('Starts with: ' + str.slice(0, 20) + '\n');

// Check if it's a linearized/compressed PDF - look for stream objects
const streamCount = (str.match(/stream\r?\n/g) || []).length;
process.stderr.write('Stream count: ' + streamCount + '\n');

// Try to find any readable text - look for font encoding or raw text
// Some PDFs store text in streams - try to find uncompressed ones
const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let m;
let count = 0;
while ((m = streamRe.exec(str)) !== null && count < 30) {
  const content = m[1];
  // Check if this stream has readable ASCII (not compressed)
  const readable = content.replace(/[^\x20-\x7E\n]/g, '').trim();
  if (readable.length > 50) {
    process.stderr.write('--- Stream ' + count + ' (readable len=' + readable.length + ') ---\n');
    process.stderr.write(readable.slice(0, 500) + '\n');
  }
  count++;
}

// Also try direct text extraction - some PDFs have unencoded text
const directText = str.replace(/[^\x20-\x7E\n]/g, ' ').replace(/ {4,}/g, '\n');
const lines = directText.split('\n').filter(l => {
  const t = l.trim();
  return t.length > 20 && /[a-zA-Z]{3,}/.test(t) && t.split(' ').length > 2;
});
console.log(lines.slice(0, 200).join('\n'));
