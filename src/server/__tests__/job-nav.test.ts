/**
 * job-nav.test.ts
 *
 * Focused tests for the inner Job workspace navigation structure.
 * Spec: docs/pasted-content-2026-08-24T00-00-41.txt
 *
 * These are source-level tests — they parse job-detail.tsx and assert
 * the navigation map without needing a browser or DOM.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function src(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const jobDetailSrc = src('src/pages/job-detail.tsx');
const jobPOSrc = src('src/components/job/JobPurchaseOrders.tsx');

// ── 1. Group names and order ─────────────────────────────────────────────────

describe('Job nav — group names and order', () => {
  const groups = ['Job', 'Work', 'Field & Files', 'Finance', 'Safety'];

  it('has exactly 5 nav groups', () => {
    // NAV_GROUPS array has exactly 5 top-level group objects — count the opening braces
    // that immediately follow a group label declaration
    const matches = jobDetailSrc.match(/\{\s*\n\s*label: '(?:Job|Work|Field & Files|Finance|Safety)'/g) ?? [];
    expect(matches.length).toBe(5);
  });

  groups.forEach((name, idx) => {
    it(`group ${idx + 1} is "${name}"`, () => {
      expect(jobDetailSrc).toContain(`label: '${name}'`);
    });
  });

  it('groups appear in correct order (Job → Work → Field & Files → Finance → Safety)', () => {
    const positions = groups.map(g => jobDetailSrc.indexOf(`label: '${g}'`));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('does not contain old group label "Site / Daily"', () => {
    expect(jobDetailSrc).not.toContain("label: 'Site / Daily'");
  });

  it('does not contain old group label "Work / Compliance"', () => {
    expect(jobDetailSrc).not.toContain("label: 'Work / Compliance'");
  });

  it('does not contain old group label "Money / Records"', () => {
    expect(jobDetailSrc).not.toContain("label: 'Money / Records'");
  });
});

// ── 2. Details is the default landing tab ────────────────────────────────────

describe('Job nav — Details default', () => {
  it('falls back to "details" when no tab param is present', () => {
    expect(jobDetailSrc).toContain("return 'details'");
  });

  it('Details is the only item in the JOB group', () => {
    // JOB group should contain details and nothing else before the next group
    const jobGroupMatch = jobDetailSrc.match(/label: 'Job'[\s\S]*?label: 'Work'/);
    expect(jobGroupMatch).not.toBeNull();
    const jobGroupBlock = jobGroupMatch![0];
    expect(jobGroupBlock).toContain("key: 'details'");
    expect(jobGroupBlock).not.toContain("key: 'photos'");
    expect(jobGroupBlock).not.toContain("key: 'tasks'");
  });
});

// ── 3. Tab-to-route mapping (query values preserved) ─────────────────────────

describe('Job nav — tab-to-route mapping', () => {
  const tabKeys: string[] = [
    'details', 'tasks', 'notes', 'delays', 'progress', 'attendance',
    'photos', 'drawings', 'files',
    'estimates', 'purchase-orders', 'invoices', 'costs',
    'forms', 'safety',
  ];

  tabKeys.forEach(key => {
    it(`tab key "${key}" exists in NAV_GROUPS`, () => {
      expect(jobDetailSrc).toContain(`key: '${key}'`);
    });
  });

  it('tab init guard accepts all 15 tab keys', () => {
    const guard = jobDetailSrc.match(/if \(t === 'photos'[\s\S]*?return t as Tab/)?.[0] ?? '';
    tabKeys.filter(k => k !== 'details').forEach(key => {
      expect(guard).toContain(`'${key}'`);
    });
  });
});

// ── 4. Legacy query compatibility ────────────────────────────────────────────

describe('Job nav — legacy query compatibility', () => {
  it('tab=costs still accepted (route value unchanged, label is Job Ledger)', () => {
    expect(jobDetailSrc).toContain("key: 'costs'");
    expect(jobDetailSrc).toContain("label: 'Job Ledger'");
    // Internal key must NOT be renamed to job-ledger
    expect(jobDetailSrc).not.toContain("key: 'job-ledger'");
  });

  it('tab=estimates still accepted', () => {
    expect(jobDetailSrc).toContain("key: 'estimates'");
  });

  it('tab=progress still accepted', () => {
    expect(jobDetailSrc).toContain("key: 'progress'");
  });

  it('tab=attendance still accepted', () => {
    expect(jobDetailSrc).toContain("key: 'attendance'");
  });
});

// ── 5. Costs confirmed as Job Ledger (not a different feature) ───────────────

describe('Job nav — Costs / Job Ledger determination', () => {
  it('JobCosts.tsx uses LedgerEntry type (confirms cost ledger workflow)', () => {
    const costsSrc = src('src/components/job/JobCosts.tsx');
    expect(costsSrc).toContain('LedgerEntry');
  });

  it('job-detail.tsx renders JobCosts for the costs tab', () => {
    expect(jobDetailSrc).toContain("activeTab === 'costs'");
    expect(jobDetailSrc).toContain('JobCosts');
  });

  it('visible label is "Job Ledger"', () => {
    expect(jobDetailSrc).toContain("label: 'Job Ledger'");
  });
});

// ── 6. Purchase Orders placement ─────────────────────────────────────────────

describe('Job nav — Purchase Orders placement', () => {
  it('purchase-orders key is in the Finance group', () => {
    const financeBlock = jobDetailSrc.match(/label: 'Finance'[\s\S]*?label: 'Safety'/)?.[0] ?? '';
    expect(financeBlock).toContain("key: 'purchase-orders'");
  });

  it('purchase-orders is NOT in the Work group', () => {
    const workBlock = jobDetailSrc.match(/label: 'Work'[\s\S]*?label: 'Field & Files'/)?.[0] ?? '';
    expect(workBlock).not.toContain("key: 'purchase-orders'");
  });

  it('purchase-orders is NOT in the old Money/Records group (group removed)', () => {
    expect(jobDetailSrc).not.toContain("label: 'Money / Records'");
  });

  it('JobPurchaseOrders component is imported and rendered', () => {
    expect(jobDetailSrc).toContain('JobPurchaseOrders');
    expect(jobDetailSrc).toContain("activeTab === 'purchase-orders'");
  });

  it('JobPurchaseOrders.tsx comment references Finance (not Money/Records)', () => {
    expect(jobPOSrc).toContain('Finance');
    expect(jobPOSrc).not.toContain('Money / Records');
  });
});

// ── 7. WORK group contents ───────────────────────────────────────────────────

describe('Job nav — WORK group', () => {
  const workItems = ['tasks', 'notes', 'delays', 'progress', 'attendance'];

  it('Work group contains exactly Tasks, Notes, Delays, Progress, Attendance', () => {
    const workBlock = jobDetailSrc.match(/label: 'Work'[\s\S]*?label: 'Field & Files'/)?.[0] ?? '';
    workItems.forEach(key => {
      expect(workBlock).toContain(`key: '${key}'`);
    });
    // Estimates must NOT be in Work
    expect(workBlock).not.toContain("key: 'estimates'");
    // Forms/Safety must NOT be in Work
    expect(workBlock).not.toContain("key: 'forms'");
    expect(workBlock).not.toContain("key: 'safety'");
  });
});

// ── 8. FIELD & FILES group contents ─────────────────────────────────────────

describe('Job nav — FIELD & FILES group', () => {
  it('Field & Files group contains Photos, Drawings, Files', () => {
    const block = jobDetailSrc.match(/label: 'Field & Files'[\s\S]*?label: 'Finance'/)?.[0] ?? '';
    expect(block).toContain("key: 'photos'");
    expect(block).toContain("key: 'drawings'");
    expect(block).toContain("key: 'files'");
  });
});

// ── 9. FINANCE group contents and order ─────────────────────────────────────

describe('Job nav — FINANCE group order', () => {
  it('Finance group contains Estimates, Purchase Orders, Invoices, Job Ledger in order', () => {
    const block = jobDetailSrc.match(/label: 'Finance'[\s\S]*?label: 'Safety'/)?.[0] ?? '';
    const estPos = block.indexOf("key: 'estimates'");
    const poPos  = block.indexOf("key: 'purchase-orders'");
    const invPos = block.indexOf("key: 'invoices'");
    const ledPos = block.indexOf("key: 'costs'");
    expect(estPos).toBeGreaterThan(-1);
    expect(poPos).toBeGreaterThan(estPos);
    expect(invPos).toBeGreaterThan(poPos);
    expect(ledPos).toBeGreaterThan(invPos);
  });
});

// ── 10. SAFETY group contents ────────────────────────────────────────────────

describe('Job nav — SAFETY group', () => {
  it('Safety group contains Forms and Safety', () => {
    const block = jobDetailSrc.match(/label: 'Safety'[\s\S]*?\]\s*;/)?.[0] ?? '';
    expect(block).toContain("key: 'forms'");
    expect(block).toContain("key: 'safety'");
  });
});

// ── 11. No duplicate entries ─────────────────────────────────────────────────

describe('Job nav — no duplicate entries', () => {
  const allKeys = [
    'details', 'tasks', 'notes', 'delays', 'progress', 'attendance',
    'photos', 'drawings', 'files',
    'estimates', 'purchase-orders', 'invoices', 'costs',
    'forms', 'safety',
  ];

  allKeys.forEach(key => {
    it(`"${key}" appears exactly once in NAV_GROUPS`, () => {
      const matches = (jobDetailSrc.match(new RegExp(`key: '${key}'`, 'g')) ?? []).length;
      expect(matches).toBe(1);
    });
  });
});

// ── 12. Mobile access — pill nav uses ALL_NAV_ITEMS ─────────────────────────

describe('Job nav — mobile access', () => {
  it('ALL_NAV_ITEMS is used in the mobile pill nav', () => {
    // The pill nav maps over ALL_NAV_ITEMS (flattened from NAV_GROUPS)
    expect(jobDetailSrc).toContain('ALL_NAV_ITEMS');
    expect(jobDetailSrc).toContain('ALL_NAV_ITEMS.map');
  });

  it('desktop side nav still maps over NAV_GROUPS', () => {
    expect(jobDetailSrc).toContain('NAV_GROUPS.map');
  });

  it('mobile pill nav has role="tablist"', () => {
    expect(jobDetailSrc).toContain('role="tablist"');
  });

  it('mobile pill nav has aria-label="Job sections"', () => {
    expect(jobDetailSrc).toContain('aria-label="Job sections"');
  });

  it('mobile pill nav does NOT use a dropdown (no mobileNavOpen state)', () => {
    expect(jobDetailSrc).not.toContain('mobileNavOpen');
  });
});
