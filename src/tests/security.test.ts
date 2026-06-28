import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const _dir=dirname(fileURLToPath(import.meta.url));
const ROOT=join(_dir,"../..");
function src(rel){const p=join(ROOT,"src",rel);return existsSync(p)?readFileSync(p,"utf-8"):"";}
const entry=src("server/entry.ts");
describe('API guard',()=>{it('has guard',()=>{expect(entry).toContain("app.use('/api'");});it('401',()=>{expect(entry).toContain('Unauthorised');});it('isPublicRoute',()=>{expect(entry).toContain('isPublicRoute');});it('requireOwner',()=>{expect(entry).toContain('requireOwner');});it('requireAdmin',()=>{expect(entry).toContain('requireAdmin');});});
describe("Migrate owner-only",()=>{it('/api/migrate-company-settings',()=>{expect(new RegExp('/api/migrate-company-settings"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-dazza-audit',()=>{expect(new RegExp('/api/migrate-dazza-audit"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-jobs',()=>{expect(new RegExp('/api/migrate-jobs"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-team',()=>{expect(new RegExp('/api/migrate-team"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-fleet',()=>{expect(new RegExp('/api/migrate-fleet"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-estimates',()=>{expect(new RegExp('/api/migrate-estimates"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-files',()=>{expect(new RegExp('/api/migrate-files"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-form-fields',()=>{expect(new RegExp('/api/migrate-form-fields"\\s*,\\s*requireOwner').test(entry)).toBe(true);});it('/api/migrate-safety',()=>{expect(new RegExp('/api/migrate-safety"\\s*,\\s*requireOwner').test(entry)).toBe(true);});});
