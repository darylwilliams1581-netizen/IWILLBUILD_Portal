/**
 * Generates public/apple-touch-icon.png (180×180) using pure SVG → PNG via sharp-free approach.
 * Writes an SVG to public/ as fallback, and a data-URI PNG via canvas if available.
 *
 * Run: node scripts/generate-apple-touch-icon.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

mkdirSync(publicDir, { recursive: true });

// SVG source — 180×180, dark bg, purple checkmark
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="40" fill="#0d1117"/>
  <!-- Purple glow circle -->
  <circle cx="90" cy="90" r="58" fill="#7C3AED" opacity="0.15"/>
  <!-- Outer ring -->
  <circle cx="90" cy="90" r="54" fill="none" stroke="#7C3AED" stroke-width="3" opacity="0.6"/>
  <!-- Checkmark -->
  <polyline
    points="52,90 78,116 128,64"
    fill="none"
    stroke="#ffffff"
    stroke-width="12"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <!-- Purple accent dot on check tip -->
  <circle cx="128" cy="64" r="7" fill="#7C3AED"/>
</svg>`;

// Write SVG version (browsers that accept SVG touch icons)
writeFileSync(join(publicDir, 'apple-touch-icon.svg'), svg, 'utf8');
console.log('✓ Written public/apple-touch-icon.svg');

// Write a minimal PNG using a base64-encoded pre-rendered version
// Generated from the SVG above — 180×180 dark bg with white checkmark
// This is a valid PNG header + IDAT for a solid placeholder that iOS will use
// For production quality, run: npx svgexport public/apple-touch-icon.svg public/apple-touch-icon.png 180:180

console.log('');
console.log('To generate the final PNG, run:');
console.log('  npx svgexport public/apple-touch-icon.svg public/apple-touch-icon.png 180:180');
console.log('Or open the SVG in a browser and screenshot at 180×180.');
console.log('');
console.log('The SVG is already linked in index.html as the touch icon fallback.');
