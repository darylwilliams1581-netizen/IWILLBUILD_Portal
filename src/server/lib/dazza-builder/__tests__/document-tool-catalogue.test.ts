/**
 * document-tool-catalogue.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Document Builder tool catalogue and its integration with
 * buildBlock() in operations.ts.
 *
 * COVERAGE:
 * - Every Dazza-enabled catalogue entry creates a valid DocumentBlock
 * - Every generated block renders without [object Object]
 * - PPE Banner output exactly matches the manual button
 * - Banner uses title/body rather than an object converted to content
 * - Tables use the actual columns/rows schema (TableColumn objects with IDs)
 * - System fields use canonical keys
 * - Unknown toolId is rejected
 * - Protected fields cannot be overridden
 * - User-only upload/import tools cannot be applied autonomously
 * - "What Document Tools can you use?" returns the grouped catalogue
 * - buildBlock() toolId path produces the same block as the catalogue factory
 */

import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_TOOL_CATALOGUE,
  DAZZA_ENABLED_TOOLS,
  USER_ONLY_TOOLS,
  UNSUPPORTED_TOOLS,
  CATALOGUE_BY_TOOL_ID,
  buildBlockFromToolId,
  getGroupedCatalogue,
  resolveTool,
} from '../document-tool-catalogue.js';
import { buildBlock, validateOperations } from '../operations.js';
import type { BuilderOperation } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function noObjectObject(block: Record<string, unknown>): void {
  const json = JSON.stringify(block);
  expect(json).not.toContain('[object Object]');
}

function hasId(block: Record<string, unknown>): void {
  expect(typeof block.id).toBe('string');
  expect((block.id as string).length).toBeGreaterThan(0);
}

// ── Catalogue structure ───────────────────────────────────────────────────────

describe('Catalogue structure', () => {

  it('1. Every entry has a stable toolId, label, description, category', () => {
    for (const entry of DOCUMENT_TOOL_CATALOGUE) {
      expect(entry.toolId).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.category).toBeTruthy();
    }
  });

  it('2. Every Dazza-enabled entry has a factory', () => {
    for (const entry of DAZZA_ENABLED_TOOLS) {
      expect(entry.factory, `${entry.toolId} is dazzaEnabled but has no factory`).toBeDefined();
    }
  });

  it('3. Every Dazza-disabled entry has an unavailableReason', () => {
    for (const entry of DOCUMENT_TOOL_CATALOGUE.filter(e => !e.dazzaEnabled)) {
      expect(entry.unavailableReason, `${entry.toolId} is disabled but has no unavailableReason`).toBeTruthy();
    }
  });

  it('4. CATALOGUE_BY_TOOL_ID lookup is consistent', () => {
    for (const entry of DOCUMENT_TOOL_CATALOGUE) {
      expect(CATALOGUE_BY_TOOL_ID[entry.toolId]).toBe(entry);
    }
  });

  it('5. USER_ONLY_TOOLS are all dazzaEnabled=false', () => {
    for (const entry of USER_ONLY_TOOLS) {
      expect(entry.dazzaEnabled).toBe(false);
    }
  });

  it('6. UNSUPPORTED_TOOLS are dazzaEnabled=false and not user_only', () => {
    for (const entry of UNSUPPORTED_TOOLS) {
      expect(entry.dazzaEnabled).toBe(false);
      expect(entry.category).not.toBe('user_only');
    }
  });

  it('7. getGroupedCatalogue returns all categories with tools', () => {
    const groups = getGroupedCatalogue();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.label).toBeTruthy();
      expect(group.tools.length).toBeGreaterThan(0);
    }
  });

  it('8. getGroupedCatalogue covers all catalogue entries', () => {
    const groups = getGroupedCatalogue();
    const allToolIds = new Set(groups.flatMap(g => g.tools.map(t => t.toolId)));
    for (const entry of DOCUMENT_TOOL_CATALOGUE) {
      expect(allToolIds.has(entry.toolId), `${entry.toolId} missing from grouped catalogue`).toBe(true);
    }
  });

});

// ── PPE Banner — canonical factory ───────────────────────────────────────────

describe('PPE Banner — canonical factory', () => {

  it('9. Catalogue factory produces exact manual-button schema', () => {
    const entry = CATALOGUE_BY_TOOL_ID['advanced.ppe_banner'];
    expect(entry).toBeDefined();
    const block = entry!.factory!();
    expect(block.type).toBe('image');
    expect(block.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect(block.alt).toBe('PPE Required — Personal Protective Equipment');
    expect(block.size).toBe('full');
    expect(block.align).toBe('center');
    expect(block.preserveAspectRatio).toBe(true);
    hasId(block);
    noObjectObject(block);
  });

  it('10. buildBlockFromToolId("advanced.ppe_banner") matches factory output', () => {
    const block = buildBlockFromToolId('advanced.ppe_banner');
    expect(block).not.toBeNull();
    expect(block!.type).toBe('image');
    expect(block!.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect(block!.alt).toBe('PPE Required — Personal Protective Equipment');
    noObjectObject(block!);
  });

  it('11. buildBlock with toolId="advanced.ppe_banner" produces correct schema', () => {
    const op: BuilderOperation = { op: 'addBlock', toolId: 'advanced.ppe_banner' };
    const block = buildBlock(op);
    expect(block.type).toBe('image');
    expect(block.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect(block.alt).toBe('PPE Required — Personal Protective Equipment');
    expect(block.size).toBe('full');
    expect(block.align).toBe('center');
    expect(block.preserveAspectRatio).toBe(true);
    expect('content' in block).toBe(false);
    noObjectObject(block);
  });

  it('12. PPE Banner: protected fields cannot be overridden via AI inputs', () => {
    // AI tries to override src and type — both are protected
    const block = buildBlockFromToolId('advanced.ppe_banner', {
      src: '/evil/path',
      type: 'text',
      alt: 'Custom alt',  // alt IS in aiInputs — should be accepted
    });
    expect(block!.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip'); // protected
    expect(block!.type).toBe('image'); // protected
    expect(block!.alt).toBe('Custom alt'); // allowed
  });

  it('13. PPE Banner has no content field — never "[object Object]"', () => {
    const block = buildBlockFromToolId('advanced.ppe_banner');
    expect('content' in block!).toBe(false);
    noObjectObject(block!);
  });

  it('14. Each PPE Banner call gets a unique id', () => {
    const a = buildBlockFromToolId('advanced.ppe_banner');
    const b = buildBlockFromToolId('advanced.ppe_banner');
    expect(a!.id).not.toBe(b!.id);
  });

});

// ── All Dazza-enabled tools produce valid blocks ──────────────────────────────

describe('All Dazza-enabled tools — valid block output', () => {

  for (const entry of DAZZA_ENABLED_TOOLS) {
    it(`15. ${entry.toolId} — factory produces valid block without [object Object]`, () => {
      const block = entry.factory!();
      hasId(block);
      expect(block.type).toBeTruthy();
      noObjectObject(block);
    });

    it(`16. ${entry.toolId} — buildBlockFromToolId produces valid block`, () => {
      const block = buildBlockFromToolId(entry.toolId);
      expect(block).not.toBeNull();
      hasId(block!);
      noObjectObject(block!);
    });
  }

});

// ── Banner block — title/body schema ─────────────────────────────────────────

describe('Banner block — title/body schema', () => {

  it('17. Banner via toolId uses title/body, not content', () => {
    const block = buildBlockFromToolId('advanced.banner_info', {
      title: 'Test Title',
      body: 'Test body text',
    });
    expect(block!.type).toBe('banner');
    expect(block!.title).toBe('Test Title');
    expect(block!.body).toBe('Test body text');
    expect('content' in block!).toBe(false);
    noObjectObject(block!);
  });

  it('18. Banner via blockType uses title/body, not content', () => {
    const op: BuilderOperation = {
      op: 'addBlock', blockType: 'banner',
      variant: 'warning', title: 'Watch Out', body: 'Be careful',
    };
    const block = buildBlock(op);
    expect(block.type).toBe('banner');
    expect(block.variant).toBe('warning');
    expect(block.title).toBe('Watch Out');
    expect(block.body).toBe('Be careful');
    expect('content' in block).toBe(false);
    noObjectObject(block);
  });

  it('19. Banner with object in content — content discarded, title/body used', () => {
    const op: BuilderOperation = {
      op: 'addBlock', blockType: 'banner',
      variant: 'info',
      content: { title: 'Nested', body: 'Nested body' } as unknown as string,
    };
    const block = buildBlock(op);
    // content is an object — title falls back to '' (not "[object Object]")
    expect(block.title).toBe('');
    expect(block.body).toBe('');
    noObjectObject(block);
  });

  it('20. Banner with string content — accepted as title fallback', () => {
    const op: BuilderOperation = {
      op: 'addBlock', blockType: 'banner',
      variant: 'success',
      content: 'Fallback title from content',
    };
    const block = buildBlock(op);
    expect(block.title).toBe('Fallback title from content');
    noObjectObject(block);
  });

  it('21. Banner protected fields: variant cannot be overridden via toolId', () => {
    const block = buildBlockFromToolId('advanced.banner_info', {
      variant: 'danger', // protected
      title: 'My Title',
    });
    expect(block!.variant).toBe('info'); // protected — factory wins
    expect(block!.title).toBe('My Title'); // allowed
  });

});

// ── Table block — columns/rows schema ────────────────────────────────────────

describe('Table block — columns/rows schema', () => {

  it('22. Blank table via toolId has TableColumn objects with id/header/cellType', () => {
    const block = buildBlockFromToolId('tables.blank');
    expect(block!.type).toBe('table');
    const columns = block!.columns as Array<Record<string, unknown>>;
    expect(Array.isArray(columns)).toBe(true);
    expect(columns.length).toBe(3);
    for (const col of columns) {
      expect(typeof col.id).toBe('string');
      expect(col.id).toBeTruthy();
      expect(typeof col.header).toBe('string');
      expect(col.cellType).toBe('text');
    }
    noObjectObject(block!);
  });

  it('23. Blank table rows use column IDs as cell keys', () => {
    const block = buildBlockFromToolId('tables.blank');
    const columns = block!.columns as Array<Record<string, unknown>>;
    const rows = block!.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(typeof row.id).toBe('string');
      const cells = row.cells as Record<string, unknown>;
      for (const col of columns) {
        expect(col.id as string in cells).toBe(true);
      }
    }
  });

  it('24. Table via blockType also uses TableColumn schema', () => {
    const op: BuilderOperation = { op: 'addBlock', blockType: 'table', columns: 4, rows: 3 };
    const block = buildBlock(op);
    const columns = block.columns as Array<Record<string, unknown>>;
    expect(columns.length).toBe(4);
    for (const col of columns) {
      expect(typeof col.id).toBe('string');
      expect(col.cellType).toBe('text');
    }
    const rows = block.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBe(3);
    noObjectObject(block);
  });

  it('25. SWMS Risk Table has 5 columns with correct headers', () => {
    const block = buildBlockFromToolId('tables.swms_risk');
    const columns = block!.columns as Array<Record<string, unknown>>;
    expect(columns.length).toBe(5);
    const headers = columns.map(c => c.header);
    expect(headers).toContain('Activity');
    expect(headers).toContain('Hazard');
    expect(headers).toContain('Control Measures');
    noObjectObject(block!);
  });

  it('26. Sign-Off Table has signature and date cell types', () => {
    const block = buildBlockFromToolId('tables.sign_off');
    const columns = block!.columns as Array<Record<string, unknown>>;
    const cellTypes = columns.map(c => c.cellType);
    expect(cellTypes).toContain('signature');
    expect(cellTypes).toContain('date');
    noObjectObject(block!);
  });

});

// ── System fields ─────────────────────────────────────────────────────────────

describe('System field block', () => {

  it('27. system_field block via blockType uses fieldKey/label/fallback/showLabel', () => {
    const op: BuilderOperation = {
      op: 'addBlock', blockType: 'system_field',
      fieldKey: 'job_name', label: 'Job Name', fallback: '[Job Name]', showLabel: true,
    };
    const block = buildBlock(op);
    expect(block.type).toBe('system_field');
    expect(block.fieldKey).toBe('job_name');
    expect(block.label).toBe('Job Name');
    expect(block.fallback).toBe('[Job Name]');
    expect(block.showLabel).toBe(true);
    noObjectObject(block);
  });

  it('28. system_field block defaults showLabel to true', () => {
    const op: BuilderOperation = {
      op: 'addBlock', blockType: 'system_field',
      fieldKey: 'company_name', label: 'Company Name', fallback: '[Company Name]',
    };
    const block = buildBlock(op);
    expect(block.showLabel).toBe(true);
  });

});

// ── Unknown toolId ────────────────────────────────────────────────────────────

describe('Unknown toolId handling', () => {

  it('29. resolveTool returns null for unknown toolId', () => {
    expect(resolveTool('nonexistent.tool')).toBeNull();
  });

  it('30. buildBlockFromToolId returns null for unknown toolId', () => {
    expect(buildBlockFromToolId('nonexistent.tool')).toBeNull();
  });

  it('31. buildBlock with unknown toolId returns safe fallback text block', () => {
    const op: BuilderOperation = { op: 'addBlock', toolId: 'nonexistent.tool' };
    const block = buildBlock(op);
    expect(block.type).toBe('text');
    expect(String(block.content)).toContain('Unknown tool');
    noObjectObject(block);
  });

  it('32. validateOperations rejects unknown toolId', () => {
    const ops: BuilderOperation[] = [{ op: 'addBlock', toolId: 'nonexistent.tool' }];
    const errors = validateOperations(ops, 'document');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Unknown toolId');
  });

  it('33. validateOperations rejects disabled toolId (user-only)', () => {
    const ops: BuilderOperation[] = [{ op: 'addBlock', toolId: 'user.import_docx' }];
    const errors = validateOperations(ops, 'document');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('cannot be inserted by Dazza');
  });

  it('34. validateOperations rejects disabled toolId (columns)', () => {
    const ops: BuilderOperation[] = [{ op: 'addBlock', toolId: 'layout.columns' }];
    const errors = validateOperations(ops, 'document');
    expect(errors.length).toBeGreaterThan(0);
  });

});

// ── User-only tools cannot be applied autonomously ────────────────────────────

describe('User-only tools — cannot be applied autonomously', () => {

  it('35. user.import_docx is dazzaEnabled=false', () => {
    const entry = CATALOGUE_BY_TOOL_ID['user.import_docx'];
    expect(entry.dazzaEnabled).toBe(false);
  });

  it('36. user.upload_image is dazzaEnabled=false', () => {
    const entry = CATALOGUE_BY_TOOL_ID['user.upload_image'];
    expect(entry.dazzaEnabled).toBe(false);
  });

  it('37. buildBlockFromToolId returns null for user-only tools', () => {
    expect(buildBlockFromToolId('user.import_docx')).toBeNull();
    expect(buildBlockFromToolId('user.upload_image')).toBeNull();
  });

});

// ── "What Document Tools can you use?" ───────────────────────────────────────

describe('"What Document Tools can you use?" — grouped catalogue', () => {

  it('38. getGroupedCatalogue includes structure, tables, advanced_banners, safety_tools', () => {
    const groups = getGroupedCatalogue();
    const categories = groups.map(g => g.category);
    expect(categories).toContain('structure');
    expect(categories).toContain('tables');
    expect(categories).toContain('advanced_banners');
    expect(categories).toContain('safety_tools');
  });

  it('39. PPE Banner appears in safety_tools group', () => {
    const groups = getGroupedCatalogue();
    const safetyGroup = groups.find(g => g.category === 'safety_tools');
    expect(safetyGroup).toBeDefined();
    const ppeTool = safetyGroup!.tools.find(t => t.toolId === 'advanced.ppe_banner');
    expect(ppeTool).toBeDefined();
    expect(ppeTool!.dazzaEnabled).toBe(true);
  });

  it('40. User-only tools appear in user_only group and are marked dazzaEnabled=false', () => {
    const groups = getGroupedCatalogue();
    const userGroup = groups.find(g => g.category === 'user_only');
    expect(userGroup).toBeDefined();
    for (const tool of userGroup!.tools) {
      expect(tool.dazzaEnabled).toBe(false);
    }
  });

  it('41. Each tool in the grouped catalogue has toolId, label, description, dazzaEnabled', () => {
    const groups = getGroupedCatalogue();
    for (const group of groups) {
      for (const tool of group.tools) {
        expect(tool.toolId).toBeTruthy();
        expect(tool.label).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(typeof tool.dazzaEnabled).toBe('boolean');
      }
    }
  });

});

// ── Risk Matrix image ─────────────────────────────────────────────────────────

describe('Risk Matrix image — catalogue factory', () => {

  it('42. advanced.risk_matrix_image factory produces correct bundled asset', () => {
    const block = buildBlockFromToolId('advanced.risk_matrix_image');
    expect(block!.type).toBe('image');
    expect(block!.src).toBe('/airo-assets/images/safety-badges/risk-matrix');
    expect(block!.preserveAspectRatio).toBe(true);
    noObjectObject(block!);
  });

  it('43. advanced.risk_matrix_image: src is protected', () => {
    const block = buildBlockFromToolId('advanced.risk_matrix_image', {
      src: '/evil/path',
    });
    expect(block!.src).toBe('/airo-assets/images/safety-badges/risk-matrix');
  });

});

// ── Risk Matrix (interactive) ─────────────────────────────────────────────────

describe('Risk Assessment (interactive risk_matrix block)', () => {

  it('44. advanced.risk_assessment factory produces risk_matrix block', () => {
    const block = buildBlockFromToolId('advanced.risk_assessment');
    expect(block!.type).toBe('risk_matrix');
    expect(block!.showLegend).toBe(true);
    expect(block!.showOnExport).toBe(true);
    noObjectObject(block!);
  });

  it('45. advanced.risk_matrix_banner factory produces risk_matrix_banner block', () => {
    const block = buildBlockFromToolId('advanced.risk_matrix_banner');
    expect(block!.type).toBe('risk_matrix_banner');
    hasId(block!);
    noObjectObject(block!);
  });

});
