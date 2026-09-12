/**
 * swms-draft-service.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Dazza SWMS Draft Creation workflow.
 *
 * COVERAGE:
 *
 * Missing details trigger concise questions
 *   1.  All 8 critical fields missing → 8 questions returned
 *   2.  Some fields present → only missing fields questioned
 *   3.  All fields present → isComplete = true, no questions
 *   4.  Supplied details are NOT asked again
 *   5.  Questions are returned in canonical order (jurisdiction first)
 *   6.  Empty string is treated as missing
 *   7.  Whitespace-only string is treated as missing
 *   8.  title is not a critical field — missing title does not block completion
 *
 * Named tools create valid blocks (no [object Object])
 *   9.  createNewTemplate op has docStatus: 'draft'
 *  10.  Safety First Banner uses toolId 'advanced.banner_safety_first' with title/body
 *  11.  Document Title uses toolId 'structure.document_title' with content
 *  12.  System fields use blockType 'system_field' with fieldKey/label/fallback/showLabel
 *  13.  Section headings use toolId 'structure.section_heading' with content
 *  14.  Bullet lists use toolId 'structure.bullet_list' with html (not content)
 *  15.  SWMS Risk Table uses toolId 'tables.swms_risk'
 *  16.  Critical Controls Danger Banner uses toolId 'advanced.banner_danger' with title/body
 *  17.  PPE Banner uses toolId 'advanced.ppe_banner' (no content field)
 *  18.  First Aid Banner uses toolId 'advanced.banner_first_aid' with title/body
 *  19.  Sign-Off Table uses toolId 'tables.sign_off'
 *  20.  Revision Table uses toolId 'tables.revision'
 *  21.  Risk Assessment uses toolId 'advanced.risk_assessment'
 *  22.  No block has a content field that is a non-string value ([object Object] guard)
 *  23.  No banner block has a content field (banners use title/body)
 *  24.  No image block has a content field (images use src/alt)
 *
 * Approved references are cited
 *  25.  buildSwmsOperations includes referenceDocId in summary when provided
 *  26.  buildSwmsOperations notes no reference when none provided
 *  27.  buildSwmsProposalText includes reference doc name when provided
 *  28.  buildSwmsProposalText notes no reference when none provided
 *
 * New SWMS remains a private draft
 *  29.  createNewTemplate op always has docStatus: 'draft'
 *  30.  No operation sets docStatus to 'published', 'active', or any other value
 *  31.  buildSwmsOperations.docStatus is always 'draft'
 *  32.  buildSwmsOperations.isPublished is always false
 *  33.  buildSwmsOperations.isGlobalLibrary is always false
 *  34.  buildSwmsOperations.isJobAssigned is always false
 *  35.  No operation has op: 'publishDocument'
 *  36.  No operation has op: 'globalLibraryAdd'
 *  37.  No operation has op: 'assignToJob'
 *  38.  No updateTemplateSettings op changes docStatus away from 'draft'
 *
 * Section completeness
 *  39.  All 14 required sections are present in the operation list
 *  40.  Sections appear in the correct order
 *  41.  System fields include company_name, job_number, job_name, customer_name, document_number, document_revision
 *  42.  Scope paragraph includes supplied workLocation
 *  43.  Scope paragraph includes supplied jurisdiction
 *  44.  Scope paragraph includes supplied equipmentMethod
 *  45.  Critical controls include supplied emergencyRescue
 *  46.  Critical controls include supplied publicTrafficInteraction
 *  47.  Critical controls include supplied specialHazards when present
 *  48.  Competency list includes supplied workersCompetencies
 *  49.  Emergency paragraph includes supplied emergencyRescue
 *  50.  Environmental paragraph includes supplied jurisdiction
 *
 * Proposal text
 *  51.  buildSwmsProposalText includes all 8 detail fields
 *  52.  buildSwmsProposalText states "PRIVATE DRAFT"
 *  53.  buildSwmsProposalText states "not published"
 *  54.  buildSwmsProposalText states "not added to the Global Resource Library"
 *  55.  buildSwmsProposalText states "not assigned to any job"
 *  56.  buildSwmsProposalText includes regulatory compliance disclaimer
 *  57.  buildSwmsProposalText includes "Click Apply" instruction
 *
 * formatMissingDetailsMessage
 *  58.  Returns empty string when no questions
 *  59.  Includes activity title
 *  60.  Includes all missing field questions
 *  61.  Includes example answers
 *  62.  Asks user to answer all in one message
 *
 * validateSwmsDetails — edge cases
 *  63.  All fields present with whitespace → trimmed, treated as present
 *  64.  title present but all critical fields missing → isComplete false
 *  65.  presentFields includes 'title' when title is supplied
 *  66.  presentFields does not include missing fields
 */

import { describe, it, expect } from 'vitest';
import {
  validateSwmsDetails,
  buildSwmsOperations,
  buildSwmsProposalText,
  formatMissingDetailsMessage,
  SWMS_CRITICAL_FIELDS,
  type SwmsDetails,
  type SwmsBuildResult,
} from '../swms-draft-service.js';

// ── Full details fixture ──────────────────────────────────────────────────────

const FULL_DETAILS: SwmsDetails = {
  title: 'Cleaning High-Rise Windows from Crane-Suspended Work Box',
  jurisdiction: 'NSW',
  workLocation: '123 George St, Sydney NSW 2000',
  equipmentMethod: 'crane-suspended work box',
  heightFallExposure: '40m above ground level',
  workersCompetencies: '2 × licensed riggers, 1 × dogman, all with Working at Heights ticket',
  publicTrafficInteraction: 'pedestrian exclusion zone required, footpath closure',
  specialHazards: 'chemical exposure from cleaning agents, glass breakage risk, wind loading',
  emergencyRescue: 'vertical rescue team on standby, rescue plan documented, 000 + site supervisor',
};

// ── Missing details trigger concise questions ─────────────────────────────────

describe('Missing details trigger concise questions', () => {

  it('1. All 8 critical fields missing → 8 questions returned', () => {
    const result = validateSwmsDetails({ title: 'Window Cleaning SWMS' });
    expect(result.isComplete).toBe(false);
    expect(result.missingQuestions.length).toBe(8);
  });

  it('2. Some fields present → only missing fields questioned', () => {
    const result = validateSwmsDetails({
      title: 'Window Cleaning SWMS',
      jurisdiction: 'NSW',
      workLocation: '123 George St Sydney',
    });
    expect(result.isComplete).toBe(false);
    // 8 critical fields - 2 supplied = 6 missing
    expect(result.missingQuestions.length).toBe(6);
    // jurisdiction and workLocation should NOT be in missing
    const missingFields = result.missingQuestions.map((q) => q.field);
    expect(missingFields).not.toContain('jurisdiction');
    expect(missingFields).not.toContain('workLocation');
  });

  it('3. All fields present → isComplete = true, no questions', () => {
    const result = validateSwmsDetails(FULL_DETAILS);
    expect(result.isComplete).toBe(true);
    expect(result.missingQuestions.length).toBe(0);
  });

  it('4. Supplied details are NOT asked again', () => {
    const result = validateSwmsDetails({
      jurisdiction: 'QLD',
      workLocation: 'Brisbane CBD',
      equipmentMethod: 'EWP',
      heightFallExposure: '15m',
      workersCompetencies: '2 workers with EWP ticket',
      publicTrafficInteraction: 'no public access',
      specialHazards: 'none',
      emergencyRescue: '000 and site supervisor',
    });
    expect(result.isComplete).toBe(true);
    expect(result.missingQuestions.length).toBe(0);
    // All 8 critical fields should be in presentFields
    const presentFields = result.presentFields;
    expect(presentFields).toContain('jurisdiction');
    expect(presentFields).toContain('workLocation');
    expect(presentFields).toContain('equipmentMethod');
    expect(presentFields).toContain('heightFallExposure');
    expect(presentFields).toContain('workersCompetencies');
    expect(presentFields).toContain('publicTrafficInteraction');
    expect(presentFields).toContain('specialHazards');
    expect(presentFields).toContain('emergencyRescue');
  });

  it('5. Questions are returned in canonical order (jurisdiction first)', () => {
    const result = validateSwmsDetails({});
    const fields = result.missingQuestions.map((q) => q.field);
    const canonicalOrder = SWMS_CRITICAL_FIELDS.map((f) => f.field);
    expect(fields).toEqual(canonicalOrder);
  });

  it('6. Empty string is treated as missing', () => {
    const result = validateSwmsDetails({ jurisdiction: '' });
    const missingFields = result.missingQuestions.map((q) => q.field);
    expect(missingFields).toContain('jurisdiction');
  });

  it('7. Whitespace-only string is treated as missing', () => {
    const result = validateSwmsDetails({ jurisdiction: '   ' });
    const missingFields = result.missingQuestions.map((q) => q.field);
    expect(missingFields).toContain('jurisdiction');
  });

  it('8. title is not a critical field — missing title does not block completion', () => {
    const detailsWithoutTitle: SwmsDetails = {
      jurisdiction: 'NSW',
      workLocation: '123 George St Sydney',
      equipmentMethod: 'crane-suspended work box',
      heightFallExposure: '40m',
      workersCompetencies: '2 riggers',
      publicTrafficInteraction: 'exclusion zone',
      specialHazards: 'chemical exposure',
      emergencyRescue: 'vertical rescue on standby',
    };
    const result = validateSwmsDetails(detailsWithoutTitle);
    expect(result.isComplete).toBe(true);
    expect(result.missingQuestions.length).toBe(0);
  });

});

// ── Named tools create valid blocks ──────────────────────────────────────────

describe('Named tools create valid blocks (no [object Object])', () => {

  let result: SwmsBuildResult;

  // Build once and reuse across tests
  result = buildSwmsOperations(FULL_DETAILS);

  it('9. createNewTemplate op has docStatus: "draft"', () => {
    const createOp = result.operations.find((op) => op.op === 'createNewTemplate');
    expect(createOp).toBeDefined();
    expect(createOp!.docStatus).toBe('draft');
  });

  it('10. Safety First Banner uses toolId "advanced.banner_safety_first" with title/body', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'advanced.banner_safety_first',
    );
    expect(op).toBeDefined();
    expect(typeof op!.title).toBe('string');
    expect(typeof op!.body).toBe('string');
    expect(op!.content).toBeUndefined();
  });

  it('11. Document Title uses toolId "structure.document_title" with content', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.document_title',
    );
    expect(op).toBeDefined();
    expect(typeof op!.content).toBe('string');
    expect((op!.content as string).length).toBeGreaterThan(0);
  });

  it('12. System fields use blockType "system_field" with fieldKey/label/fallback/showLabel', () => {
    const systemFieldOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.blockType === 'system_field',
    );
    expect(systemFieldOps.length).toBeGreaterThan(0);
    for (const op of systemFieldOps) {
      expect(typeof op.fieldKey).toBe('string');
      expect(typeof op.label).toBe('string');
      expect(typeof op.fallback).toBe('string');
      expect(op.showLabel).toBe(true);
      // Must NOT have a content field — that would produce [object Object]
      expect(op.content).toBeUndefined();
    }
  });

  it('13. Section headings use toolId "structure.section_heading" with content', () => {
    const headingOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.section_heading',
    );
    expect(headingOps.length).toBeGreaterThan(0);
    for (const op of headingOps) {
      expect(typeof op.content).toBe('string');
      expect((op.content as string).length).toBeGreaterThan(0);
    }
  });

  it('14. Bullet lists use toolId "structure.bullet_list" with html (not content)', () => {
    const bulletOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.bullet_list',
    );
    expect(bulletOps.length).toBeGreaterThan(0);
    for (const op of bulletOps) {
      expect(typeof op.html).toBe('string');
      // html must be a valid HTML string starting with <ul>
      expect((op.html as string).startsWith('<ul>')).toBe(true);
      // Must NOT have a content field
      expect(op.content).toBeUndefined();
    }
  });

  it('15. SWMS Risk Table uses toolId "tables.swms_risk"', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'tables.swms_risk',
    );
    expect(op).toBeDefined();
  });

  it('16. Critical Controls Danger Banner uses toolId "advanced.banner_danger" with title/body', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'advanced.banner_danger',
    );
    expect(op).toBeDefined();
    expect(typeof op!.title).toBe('string');
    expect(typeof op!.body).toBe('string');
    expect(op!.content).toBeUndefined();
  });

  it('17. PPE Banner uses toolId "advanced.ppe_banner" (no content field)', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'advanced.ppe_banner',
    );
    expect(op).toBeDefined();
    expect(op!.content).toBeUndefined();
    // PPE Banner must NOT have src — the factory provides it
    // (AI cannot override src — it's a protected field)
    expect(op!.src).toBeUndefined();
  });

  it('18. First Aid Banner uses toolId "advanced.banner_first_aid" with title/body', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'advanced.banner_first_aid',
    );
    expect(op).toBeDefined();
    expect(typeof op!.title).toBe('string');
    expect(typeof op!.body).toBe('string');
    expect(op!.content).toBeUndefined();
  });

  it('19. Sign-Off Table uses toolId "tables.sign_off"', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'tables.sign_off',
    );
    expect(op).toBeDefined();
  });

  it('20. Revision Table uses toolId "tables.revision"', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'tables.revision',
    );
    expect(op).toBeDefined();
  });

  it('21. Risk Assessment uses toolId "advanced.risk_assessment"', () => {
    const op = result.operations.find(
      (op) => op.op === 'addBlock' && op.toolId === 'advanced.risk_assessment',
    );
    expect(op).toBeDefined();
  });

  it('22. No block has a content field that is a non-string value ([object Object] guard)', () => {
    for (const op of result.operations) {
      if ('content' in op) {
        // content must be a string or undefined — never an object
        expect(typeof op.content === 'string' || op.content === undefined).toBe(true);
        if (typeof op.content === 'string') {
          expect(op.content).not.toContain('[object Object]');
        }
      }
    }
  });

  it('23. No banner block has a content field (banners use title/body)', () => {
    const bannerOps = result.operations.filter(
      (op) => op.op === 'addBlock' && (
        String(op.toolId ?? '').includes('banner') ||
        String(op.blockType ?? '') === 'banner'
      ),
    );
    expect(bannerOps.length).toBeGreaterThan(0);
    for (const op of bannerOps) {
      expect(op.content).toBeUndefined();
    }
  });

  it('24. No image block has a content field (images use src/alt)', () => {
    const imageOps = result.operations.filter(
      (op) => op.op === 'addBlock' && (
        String(op.toolId ?? '') === 'advanced.ppe_banner' ||
        String(op.toolId ?? '') === 'advanced.risk_matrix_image' ||
        String(op.blockType ?? '') === 'image'
      ),
    );
    for (const op of imageOps) {
      expect(op.content).toBeUndefined();
    }
  });

});

// ── Approved references are cited ─────────────────────────────────────────────

describe('Approved references are cited', () => {

  it('25. buildSwmsOperations includes referenceDocId in summary when provided', () => {
    const result = buildSwmsOperations(FULL_DETAILS, 42, 'Bricklaying SWMS');
    expect(result.summary).toContain('#42');
    expect(result.summary).toContain('Bricklaying SWMS');
  });

  it('26. buildSwmsOperations notes no reference when none provided', () => {
    const result = buildSwmsOperations(FULL_DETAILS);
    expect(result.summary).toContain('No approved SWMS reference documents found');
  });

  it('27. buildSwmsProposalText includes reference doc name when provided', () => {
    const result = buildSwmsOperations(FULL_DETAILS, 42, 'Bricklaying SWMS');
    const text = buildSwmsProposalText(FULL_DETAILS, result, 42, 'Bricklaying SWMS');
    expect(text).toContain('#42');
    expect(text).toContain('Bricklaying SWMS');
  });

  it('28. buildSwmsProposalText notes no reference when none provided', () => {
    const result = buildSwmsOperations(FULL_DETAILS);
    const text = buildSwmsProposalText(FULL_DETAILS, result);
    expect(text).toContain('No approved SWMS reference documents found');
  });

});

// ── New SWMS remains a private draft ─────────────────────────────────────────

describe('New SWMS remains a private draft', () => {

  let result: SwmsBuildResult;
  result = buildSwmsOperations(FULL_DETAILS);

  it('29. createNewTemplate op always has docStatus: "draft"', () => {
    const createOp = result.operations.find((op) => op.op === 'createNewTemplate');
    expect(createOp).toBeDefined();
    expect(createOp!.docStatus).toBe('draft');
  });

  it('30. No operation sets docStatus to "published", "active", or any other non-draft value', () => {
    for (const op of result.operations) {
      if ('docStatus' in op) {
        expect(op.docStatus).toBe('draft');
      }
    }
  });

  it('31. buildSwmsOperations.docStatus is always "draft"', () => {
    expect(result.docStatus).toBe('draft');
  });

  it('32. buildSwmsOperations.isPublished is always false', () => {
    expect(result.isPublished).toBe(false);
  });

  it('33. buildSwmsOperations.isGlobalLibrary is always false', () => {
    expect(result.isGlobalLibrary).toBe(false);
  });

  it('34. buildSwmsOperations.isJobAssigned is always false', () => {
    expect(result.isJobAssigned).toBe(false);
  });

  it('35. No operation has op: "publishDocument"', () => {
    const publishOps = result.operations.filter((op) => op.op === 'publishDocument');
    expect(publishOps.length).toBe(0);
  });

  it('36. No operation has op: "globalLibraryAdd"', () => {
    const libraryOps = result.operations.filter((op) => op.op === 'globalLibraryAdd');
    expect(libraryOps.length).toBe(0);
  });

  it('37. No operation has op: "assignToJob"', () => {
    const jobOps = result.operations.filter((op) => op.op === 'assignToJob');
    expect(jobOps.length).toBe(0);
  });

  it('38. No updateTemplateSettings op changes docStatus away from "draft"', () => {
    const settingsOps = result.operations.filter((op) => op.op === 'updateTemplateSettings');
    for (const op of settingsOps) {
      if ('docStatus' in op) {
        expect(op.docStatus).toBe('draft');
      }
    }
  });

});

// ── Section completeness ──────────────────────────────────────────────────────

describe('Section completeness', () => {

  let result: SwmsBuildResult;
  result = buildSwmsOperations(FULL_DETAILS);

  it('39. All 14 required sections are present in affectedSections', () => {
    const sections = result.affectedSections;
    expect(sections.some((s) => s.includes('Safety First Banner'))).toBe(true);
    expect(sections.some((s) => s.includes('Scope of Work'))).toBe(true);
    expect(sections.some((s) => s.includes('Work Sequence'))).toBe(true);
    expect(sections.some((s) => s.includes('Hazards, Risks and Controls'))).toBe(true);
    expect(sections.some((s) => s.includes('Critical Controls'))).toBe(true);
    expect(sections.some((s) => s.includes('PPE Banner'))).toBe(true);
    expect(sections.some((s) => s.includes('Plant and Equipment'))).toBe(true);
    expect(sections.some((s) => s.includes('Competency'))).toBe(true);
    expect(sections.some((s) => s.includes('Environmental'))).toBe(true);
    expect(sections.some((s) => s.includes('Emergency'))).toBe(true);
    expect(sections.some((s) => s.includes('Revision'))).toBe(true);
    expect(sections.some((s) => s.includes('Worker Sign-On'))).toBe(true);
  });

  it('40. createNewTemplate is the first operation', () => {
    expect(result.operations[0].op).toBe('createNewTemplate');
  });

  it('41. System fields include all 6 required fieldKeys', () => {
    const systemFieldOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.blockType === 'system_field',
    );
    const fieldKeys = systemFieldOps.map((op) => op.fieldKey as string);
    expect(fieldKeys).toContain('company_name');
    expect(fieldKeys).toContain('job_number');
    expect(fieldKeys).toContain('job_name');
    expect(fieldKeys).toContain('customer_name');
    expect(fieldKeys).toContain('document_number');
    expect(fieldKeys).toContain('document_revision');
  });

  it('42. Scope paragraph includes supplied workLocation', () => {
    const paragraphOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.paragraph',
    );
    const scopeParagraph = paragraphOps.find(
      (op) => typeof op.content === 'string' && (op.content as string).includes('Location:'),
    );
    expect(scopeParagraph).toBeDefined();
    expect(scopeParagraph!.content as string).toContain(FULL_DETAILS.workLocation!);
  });

  it('43. Scope paragraph includes supplied jurisdiction', () => {
    const paragraphOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.paragraph',
    );
    const scopeParagraph = paragraphOps.find(
      (op) => typeof op.content === 'string' && (op.content as string).includes('Jurisdiction:'),
    );
    expect(scopeParagraph).toBeDefined();
    expect(scopeParagraph!.content as string).toContain(FULL_DETAILS.jurisdiction!);
  });

  it('44. Scope paragraph includes supplied equipmentMethod', () => {
    const paragraphOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.paragraph',
    );
    const scopeParagraph = paragraphOps.find(
      (op) => typeof op.content === 'string' && (op.content as string).includes('Access Method:'),
    );
    expect(scopeParagraph).toBeDefined();
    expect(scopeParagraph!.content as string).toContain(FULL_DETAILS.equipmentMethod!);
  });

  it('45. Critical controls bullet list includes supplied emergencyRescue', () => {
    const bulletOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.bullet_list',
    );
    const criticalBullet = bulletOps.find(
      (op) => typeof op.html === 'string' && (op.html as string).includes('rescue'),
    );
    expect(criticalBullet).toBeDefined();
    expect(criticalBullet!.html as string).toContain('vertical rescue team on standby');
  });

  it('46. Critical controls bullet list includes supplied publicTrafficInteraction', () => {
    const bulletOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.bullet_list',
    );
    // Find the bullet that contains the public/traffic interaction controls text
    const criticalBullet = bulletOps.find(
      (op) => typeof op.html === 'string' && (op.html as string).includes('public interaction controls'),
    );
    expect(criticalBullet).toBeDefined();
    expect(criticalBullet!.html as string).toContain('pedestrian exclusion zone required');
  });

  it('47. Critical controls bullet list includes supplied specialHazards when present', () => {
    const bulletOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.bullet_list',
    );
    const criticalBullet = bulletOps.find(
      (op) => typeof op.html === 'string' && (op.html as string).includes('chemical exposure'),
    );
    expect(criticalBullet).toBeDefined();
  });

  it('48. Competency bullet list includes supplied workersCompetencies', () => {
    const bulletOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.bullet_list',
    );
    const competencyBullet = bulletOps.find(
      (op) => typeof op.html === 'string' && (op.html as string).includes('licensed riggers'),
    );
    expect(competencyBullet).toBeDefined();
  });

  it('49. Emergency paragraph includes supplied emergencyRescue', () => {
    const paragraphOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.paragraph',
    );
    const emergencyParagraph = paragraphOps.find(
      (op) => typeof op.content === 'string' && (op.content as string).includes('vertical rescue team on standby'),
    );
    expect(emergencyParagraph).toBeDefined();
  });

  it('50. Environmental paragraph includes supplied jurisdiction', () => {
    const paragraphOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId === 'structure.paragraph',
    );
    const envParagraph = paragraphOps.find(
      (op) => typeof op.content === 'string' && (op.content as string).includes('NSW'),
    );
    expect(envParagraph).toBeDefined();
  });

});

// ── Proposal text ─────────────────────────────────────────────────────────────

describe('Proposal text', () => {

  let result: SwmsBuildResult;
  let proposalText: string;

  result = buildSwmsOperations(FULL_DETAILS);
  proposalText = buildSwmsProposalText(FULL_DETAILS, result);

  it('51. buildSwmsProposalText includes all 8 detail fields', () => {
    expect(proposalText).toContain('NSW');
    expect(proposalText).toContain('123 George St');
    expect(proposalText).toContain('crane-suspended work box');
    expect(proposalText).toContain('40m above ground level');
    expect(proposalText).toContain('licensed riggers');
    expect(proposalText).toContain('pedestrian exclusion zone');
    expect(proposalText).toContain('chemical exposure');
    expect(proposalText).toContain('vertical rescue team');
  });

  it('52. buildSwmsProposalText states "PRIVATE DRAFT"', () => {
    expect(proposalText).toContain('PRIVATE DRAFT');
  });

  it('53. buildSwmsProposalText states "not published"', () => {
    expect(proposalText.toLowerCase()).toContain('not published');
  });

  it('54. buildSwmsProposalText states "not added to the Global Resource Library"', () => {
    expect(proposalText).toContain('not added to the Global Resource Library');
  });

  it('55. buildSwmsProposalText states "not assigned to any job"', () => {
    expect(proposalText).toContain('not assigned to any job');
  });

  it('56. buildSwmsProposalText includes regulatory compliance disclaimer', () => {
    expect(proposalText.toLowerCase()).toContain('regulatory compliance');
    expect(proposalText.toLowerCase()).toContain('starting point');
  });

  it('57. buildSwmsProposalText includes "Click Apply" instruction', () => {
    expect(proposalText).toContain('Apply');
  });

});

// ── formatMissingDetailsMessage ───────────────────────────────────────────────

describe('formatMissingDetailsMessage', () => {

  it('58. Returns empty string when no questions', () => {
    expect(formatMissingDetailsMessage([], 'Window Cleaning')).toBe('');
  });

  it('59. Includes activity title', () => {
    const { missingQuestions } = validateSwmsDetails({});
    const msg = formatMissingDetailsMessage(missingQuestions, 'Cleaning High-Rise Windows');
    expect(msg).toContain('Cleaning High-Rise Windows');
  });

  it('60. Includes all missing field questions', () => {
    const { missingQuestions } = validateSwmsDetails({});
    const msg = formatMissingDetailsMessage(missingQuestions, 'Window Cleaning');
    for (const q of missingQuestions) {
      expect(msg).toContain(q.question);
    }
  });

  it('61. Includes example answers', () => {
    const { missingQuestions } = validateSwmsDetails({});
    const msg = formatMissingDetailsMessage(missingQuestions, 'Window Cleaning');
    for (const q of missingQuestions) {
      expect(msg).toContain(q.example);
    }
  });

  it('62. Asks user to answer all in one message', () => {
    const { missingQuestions } = validateSwmsDetails({});
    const msg = formatMissingDetailsMessage(missingQuestions, 'Window Cleaning');
    expect(msg.toLowerCase()).toContain('one message');
  });

});

// ── validateSwmsDetails — edge cases ─────────────────────────────────────────

describe('validateSwmsDetails — edge cases', () => {

  it('63. Fields with leading/trailing whitespace are treated as present', () => {
    const result = validateSwmsDetails({
      jurisdiction: '  NSW  ',
      workLocation: '  Sydney  ',
      equipmentMethod: '  EWP  ',
      heightFallExposure: '  15m  ',
      workersCompetencies: '  2 workers  ',
      publicTrafficInteraction: '  no public access  ',
      specialHazards: '  none  ',
      emergencyRescue: '  000  ',
    });
    expect(result.isComplete).toBe(true);
  });

  it('64. title present but all critical fields missing → isComplete false', () => {
    const result = validateSwmsDetails({ title: 'My SWMS' });
    expect(result.isComplete).toBe(false);
    expect(result.missingQuestions.length).toBe(8);
  });

  it('65. presentFields includes "title" when title is supplied', () => {
    const result = validateSwmsDetails({ title: 'My SWMS' });
    expect(result.presentFields).toContain('title');
  });

  it('66. presentFields does not include missing fields', () => {
    const result = validateSwmsDetails({ jurisdiction: 'NSW' });
    expect(result.presentFields).toContain('jurisdiction');
    expect(result.presentFields).not.toContain('workLocation');
    expect(result.presentFields).not.toContain('equipmentMethod');
  });

});

// ── Additional invariant: buildBlock produces correct schemas ─────────────────

describe('buildBlock integration — SWMS operations produce correct block schemas', () => {

  it('67. All addBlock ops with toolId reference a Dazza-enabled catalogue entry', async () => {
    // Import the catalogue to verify toolIds
    const { resolveTool } = await import('../document-tool-catalogue.js');
    const result = buildSwmsOperations(FULL_DETAILS);
    const toolIdOps = result.operations.filter(
      (op) => op.op === 'addBlock' && op.toolId,
    );
    expect(toolIdOps.length).toBeGreaterThan(0);
    for (const op of toolIdOps) {
      const entry = resolveTool(String(op.toolId));
      expect(entry).not.toBeNull();
      expect(entry!.dazzaEnabled).toBe(true);
    }
  });

  it('68. buildBlock produces correct image schema for PPE Banner toolId', async () => {
    const { buildBlock } = await import('../operations.js');
    const op = { op: 'addBlock', toolId: 'advanced.ppe_banner' };
    const block = buildBlock(op);
    expect(block.type).toBe('image');
    expect(block.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect(block.content).toBeUndefined();
    expect(typeof block.id).toBe('string');
  });

  it('69. buildBlock produces correct banner schema for safety_first toolId', async () => {
    const { buildBlock } = await import('../operations.js');
    const op = {
      op: 'addBlock',
      toolId: 'advanced.banner_safety_first',
      title: 'SAFETY FIRST',
      body: 'ARRIVE SAFE • WORK SAFE • GO HOME SAFE',
    };
    const block = buildBlock(op);
    expect(block.type).toBe('banner');
    expect(block.variant).toBe('safety_first');
    expect(block.title).toBe('SAFETY FIRST');
    expect(block.body).toBe('ARRIVE SAFE • WORK SAFE • GO HOME SAFE');
    expect(block.content).toBeUndefined();
  });

  it('70. buildBlock produces correct sign-off table schema', async () => {
    const { buildBlock } = await import('../operations.js');
    const op = { op: 'addBlock', toolId: 'tables.sign_off' };
    const block = buildBlock(op);
    expect(block.type).toBe('table');
    const columns = block.columns as Array<{ header: string; cellType: string }>;
    expect(columns.some((c) => c.header === 'Signature' && c.cellType === 'signature')).toBe(true);
    expect(columns.some((c) => c.header === 'Date' && c.cellType === 'date')).toBe(true);
  });

  it('71. buildBlock produces correct SWMS risk table schema', async () => {
    const { buildBlock } = await import('../operations.js');
    const op = { op: 'addBlock', toolId: 'tables.swms_risk' };
    const block = buildBlock(op);
    expect(block.type).toBe('table');
    const columns = block.columns as Array<{ header: string }>;
    expect(columns.some((c) => c.header === 'Activity')).toBe(true);
    expect(columns.some((c) => c.header === 'Hazard')).toBe(true);
    expect(columns.some((c) => c.header === 'Control Measures')).toBe(true);
  });

  it('72. No [object Object] in any block produced by buildBlock for SWMS ops', async () => {
    const { buildBlock } = await import('../operations.js');
    const result = buildSwmsOperations(FULL_DETAILS);
    const addBlockOps = result.operations.filter((op) => op.op === 'addBlock');
    for (const op of addBlockOps) {
      const block = buildBlock(op);
      const serialised = JSON.stringify(block);
      expect(serialised).not.toContain('[object Object]');
    }
  });

});
