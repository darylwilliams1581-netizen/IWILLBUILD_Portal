// Try to find readable XML text runs anywhere in the binary
const fs = require('fs');
const buf = fs.readFileSync('docs/Camera_Viewport_Watermark_Guide_Airo_Compatible.docx');

// Search for the w:t pattern which holds actual text in Word XML
// These may appear after decompressed blocks if the file has uncompressed sections
const str = buf.toString('latin1');

// Try finding <?xml or <w:document
const xmlIdx = str.indexOf('<?xml');
const wdocIdx = str.indexOf('<w:document');
const wtIdx = str.indexOf('<w:t>');
process.stderr.write('<?xml at: ' + xmlIdx + '\n');
process.stderr.write('<w:document at: ' + wdocIdx + '\n');
process.stderr.write('<w:t> at: ' + wtIdx + '\n');
process.stderr.write('File size: ' + buf.length + '\n');

// Try to find any long readable ASCII sequences that look like document content
const readable = [];
let run = '';
for (let i = 0; i < buf.length; i++) {
  const c = buf[i];
  if (c >= 32 && c < 127) {
    run += String.fromCharCode(c);
  } else {
    if (run.length > 40) readable.push(run);
    run = '';
  }
}
// Filter to lines that look like English prose (contain spaces and common words)
const prose = readable.filter(r => r.includes(' ') && /[a-z]{3,}/.test(r));
console.log(prose.slice(0, 300).join('\n'));
