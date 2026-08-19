/**
 * Rewrites po-gate1.test.ts to use the po-auth.stub.ts alias approach.
 * - Removes the vi.mock('../../lib/po-auth', ...) block (lines 71-155 approx)
 * - Removes the vi.mock('../../db/client', ...) block (now handled by alias)
 * - Replaces mockPoAuthProfile.value = X with __setMockProfile(X)
 * - Adds import of __setMockProfile at the top
 * - Removes unused hoisted refs
 */
import fs from 'fs';

let src = fs.readFileSync('src/server/__tests__/po-gate1.test.ts', 'utf8');

// 1. Add __setMockProfile import after the vitest import line
src = src.replace(
  `import { describe, it, expect, vi, beforeEach } from 'vitest';`,
  `import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __setMockProfile } from '../../../src/test/stubs/po-auth.stub';`
);

// 2. Remove the entire vi.mock('../../lib/po-auth', ...) block
// It starts with "vi.mock('../../lib/po-auth', () => ({" and ends with "}));"
// followed by a blank line
const poAuthMockStart = `vi.mock('../../lib/po-auth', () => ({`;
const poAuthMockEnd = `}));\n\nvi.mock('../../db/client',`;
const dbClientMockEnd = `}));\n\nvi.mock('../../lib/document-engine.js',`;

const startIdx = src.indexOf(poAuthMockStart);
const dbClientStart = src.indexOf(`vi.mock('../../db/client',`);
const docEngineStart = src.indexOf(`vi.mock('../../lib/document-engine.js',`);

if (startIdx === -1) { console.error('Could not find po-auth mock start'); process.exit(1); }
if (dbClientStart === -1) { console.error('Could not find db/client mock start'); process.exit(1); }
if (docEngineStart === -1) { console.error('Could not find document-engine mock start'); process.exit(1); }

// Find end of db/client mock block (ends before document-engine mock)
// Remove po-auth mock block AND db/client mock block (both now handled by aliases)
src = src.slice(0, startIdx) + src.slice(docEngineStart);

// 3. Replace all mockPoAuthProfile.value = X with __setMockProfile(X)
// Pattern: mockPoAuthProfile.value = null;
src = src.replace(/mockPoAuthProfile\.value = null;/g, '__setMockProfile(null);');
// Pattern: mockPoAuthProfile.value = { ... }; (multiline)
src = src.replace(/mockPoAuthProfile\.value = \{([^}]+)\};/gs, (match, inner) => {
  return `__setMockProfile({${inner}});`;
});

// 4. Remove the hoisted refs that are no longer needed
// Remove: const mockPoAuthProfile = vi.hoisted(...) block
src = src.replace(/\/\/ po-auth\.ts is the single source of truth[\s\S]*?const mockDbExecuteForRuntime = vi\.hoisted\(\(\) => \(\{ fn: vi\.fn\(\) \}\)\);\n\n/m, '');

// 5. Remove unused mockSession, mockProfile, mockDbExecute, mockDbQuery hoisted refs
src = src.replace(/const mockSession = vi\.hoisted\([^)]+\);\n/g, '');
src = src.replace(/const mockProfile = vi\.hoisted\([^)]+\);\n/g, '');
src = src.replace(/const mockDbExecute = vi\.hoisted\([^)]+\);\n/g, '');
src = src.replace(/const mockDbQuery = vi\.hoisted\([^)]+\);\n/g, '');

// 6. Replace mockDbExecuteForRuntime.fn.mockReset() and mockDbExecuteForRuntime.fn.mockXxx
// with the db-client stub's execute mock — but since the stub creates a fresh vi.fn() on
// each property access, we can't control it from outside. Remove those lines.
src = src.replace(/\s*mockDbExecuteForRuntime\.fn\.[^\n]+\n/g, '\n');

fs.writeFileSync('src/server/__tests__/po-gate1.test.ts', src);
console.log('done, lines:', src.split('\n').length);
