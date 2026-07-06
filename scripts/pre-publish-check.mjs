#!/usr/bin/env node
/**
 * pre-publish-check.mjs
 *
 * Verifies that all required content JSON files exist and contain the expected
 * top-level keys before the Vite build runs. Exits non-zero with a clear
 * diagnostic message on any failure so the build fails fast rather than
 * producing a broken bundle or a runtime crash on the live site.
 *
 * Called automatically by publish-build.mjs before every build step.
 * Can also be run standalone:  node scripts/pre-publish-check.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Required content file specifications ──────────────────────────────────────
//
// Each entry declares:
//   file        — path relative to project root
//   requiredKeys — top-level keys that must be present AND be the right type
//
// "arrayKey"  → value must be an array with at least one element
// "objectKey" → value must be a non-null object
//
const REQUIRED_CONTENT = [
  {
    file: 'src/content/pages/home.json',
    label: 'home',
    arrayKeys: ['tabs', 'rows'],
    objectKeys: [],
    // rows items must have these string fields
    rowShape: { key: 'rows', fields: ['label', 'status', 'color', 'id'] },
  },
  {
    file: 'src/content/pages/studio.json',
    label: 'studio',
    arrayKeys: ['CATEGORIES'],
    objectKeys: [],
    rowShape: null,
  },
  {
    file: 'src/content/pages/roadmap.json',
    label: 'roadmap',
    arrayKeys: ['phases', 'GATES'],
    objectKeys: [],
    // GATES items must have these string/array fields
    rowShape: { key: 'GATES', fields: ['id', 'label', 'status', 'criteria', 'unblock'] },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

let errors = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log('\n[pre-publish-check] Verifying required content files...\n');

for (const spec of REQUIRED_CONTENT) {
  const absPath = join(root, spec.file);
  console.log(`  Checking ${spec.file}`);

  // 1. File must exist
  if (!existsSync(absPath)) {
    fail(`MISSING FILE: ${spec.file}`);
    fail(`  → Create it with the required shape for ${spec.label} content.`);
    errors++; // count the hint line too so the summary is accurate
    continue;
  }

  // 2. Must be valid JSON
  let data;
  try {
    data = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (e) {
    fail(`INVALID JSON in ${spec.file}: ${e.message}`);
    continue;
  }

  // 3. Must be a plain object at the top level
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail(`${spec.file}: top-level value must be a JSON object, got ${Array.isArray(data) ? 'array' : typeof data}`);
    continue;
  }

  // 4. Required array keys must exist and be non-empty arrays
  for (const key of spec.arrayKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      fail(`${spec.file}: missing required key "${key}"`);
    } else if (!Array.isArray(data[key])) {
      fail(`${spec.file}: "${key}" must be an array, got ${typeof data[key]}`);
    } else if (data[key].length === 0) {
      fail(`${spec.file}: "${key}" array must not be empty`);
    } else {
      pass(`${spec.label}.${key} — array(${data[key].length})`);
    }
  }

  // 5. Required object keys must exist and be non-null objects
  for (const key of spec.objectKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      fail(`${spec.file}: missing required key "${key}"`);
    } else if (typeof data[key] !== 'object' || data[key] === null) {
      fail(`${spec.file}: "${key}" must be an object, got ${typeof data[key]}`);
    } else {
      pass(`${spec.label}.${key} — object`);
    }
  }

  // 6. Row-shape check: every item in the named array must have the required fields
  if (spec.rowShape) {
    const { key, fields } = spec.rowShape;
    const arr = data[key];
    if (Array.isArray(arr)) {
      arr.forEach((item, idx) => {
        if (typeof item !== 'object' || item === null) {
          fail(`${spec.file}: ${key}[${idx}] must be an object`);
          return;
        }
        for (const field of fields) {
          if (!Object.prototype.hasOwnProperty.call(item, field)) {
            fail(`${spec.file}: ${key}[${idx}] missing required field "${field}"`);
          }
        }
      });
      if (errors === 0) {
        pass(`${spec.label}.${key} items — all ${fields.join(', ')} fields present`);
      }
    }
  }

  console.log('');
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (errors > 0) {
  console.error(`\n[pre-publish-check] FAILED — ${errors} error(s) found.\n`);
  console.error('  Fix the issues above before running the build.\n');
  process.exit(1);
} else {
  console.log(`[pre-publish-check] All content files OK — proceeding with build.\n`);
  process.exit(0);
}
