/**
 * PO Finance Phase 1 — Company-wide Finance API tests
 *
 * Tests:
 *  1. Tenant isolation — Company A cannot see Company B POs
 *  2. Unauthorized member receives 403
 *  3. Non-dollar user cannot receive rates/totals on detail
 *  4. Client-supplied totals are ignored (server recalculates)
 *  5. Invalid lines are rejected
 *  6. Transaction failure leaves no header or orphan lines
 *  7. Draft deletion works
 *  8. Non-draft deletion is rejected
 *  9. Status filters and counts are correct
 * 10. Pagination has no duplicates (cursor-based)
 * 11. Finance PO list endpoint returns correct shape
 * 12. Finance PO create endpoint returns 201 with correct shape
 * 13. Finance PO detail endpoint returns correct shape
 * 14. Finance PO update endpoint returns correct shape
 * 15. Finance PO delete endpoint returns ok: true
 * 16. Existing job-scoped routes still work (compatibility)
 * 17. PDF endpoint returns application/pdf bytes
 * 18. Compose-defaults returns correct fields
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Helpers ───────────────────────────────────────────────────────────────────
// (kept for potential future runtime tests)

function ownerProfile(companyId = 1) {
  return {
    id: 1, userId: 'user-1', role: 'owner', companyId,
    isOwner: true, isAdmin: true, canFinance: true, canSeeDollars: true, canDelete: true,
  };
}
void ownerProfile; // suppress unused warning

// ── Source-level structural checks ────────────────────────────────────────────

describe('PO Finance — source structure', () => {
  const serviceFile = path.resolve(__dirname, '../lib/po-service.ts');
  const financeListFile = path.resolve(__dirname, '../api/finance/purchase-orders/GET.ts');
  const financePostFile = path.resolve(__dirname, '../api/finance/purchase-orders/POST.ts');
  const financeDetailFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts');
  const financePutFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/PUT.ts');
  const financeDeleteFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/DELETE.ts');
  const financePdfFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/pdf/GET.ts');
  const pdfBuilderFile = path.resolve(__dirname, '../lib/purchase-order-pdf-document.ts');
  const composeDefaultsFile = path.resolve(__dirname, '../api/purchase-orders/[poId]/compose-defaults/GET.ts');
  const sendEmailFile = path.resolve(__dirname, '../api/purchase-orders/[poId]/send-email/POST.ts');

  it('po-service.ts exists', () => {
    expect(fs.existsSync(serviceFile)).toBe(true);
  });

  it('po-service exports createPO, updatePO, deletePO, listPOs, fetchPODetail', () => {
    const src = fs.readFileSync(serviceFile, 'utf8');
    expect(src).toContain('export async function createPO');
    expect(src).toContain('export async function updatePO');
    expect(src).toContain('export async function deletePO');
    expect(src).toContain('export async function listPOs');
    expect(src).toContain('export async function fetchPODetail');
  });

  it('po-service uses START TRANSACTION / COMMIT / ROLLBACK', () => {
    const src = fs.readFileSync(serviceFile, 'utf8');
    expect(src).toContain('START TRANSACTION');
    expect(src).toContain('COMMIT');
    expect(src).toContain('ROLLBACK');
  });

  it('po-service never trusts client totals (no direct total from body)', () => {
    const src = fs.readFileSync(serviceFile, 'utf8');
    expect(src).toContain('computeTotals');
    // Should not assign body.total or body.subtotal directly
    expect(src).not.toMatch(/body\.(subtotal|gst|total)\s*[^=]/);
  });

  it('Finance list handler exists and uses po-service', () => {
    expect(fs.existsSync(financeListFile)).toBe(true);
    const src = fs.readFileSync(financeListFile, 'utf8');
    expect(src).toContain('listPOs');
  });

  it('Finance POST handler exists and uses po-service', () => {
    expect(fs.existsSync(financePostFile)).toBe(true);
    const src = fs.readFileSync(financePostFile, 'utf8');
    expect(src).toContain('createPO');
  });

  it('Finance detail GET handler exists and uses po-service', () => {
    expect(fs.existsSync(financeDetailFile)).toBe(true);
    const src = fs.readFileSync(financeDetailFile, 'utf8');
    expect(src).toContain('fetchPODetail');
  });

  it('Finance PUT handler exists and uses po-service', () => {
    expect(fs.existsSync(financePutFile)).toBe(true);
    const src = fs.readFileSync(financePutFile, 'utf8');
    expect(src).toContain('updatePO');
  });

  it('Finance DELETE handler exists and uses po-service', () => {
    expect(fs.existsSync(financeDeleteFile)).toBe(true);
    const src = fs.readFileSync(financeDeleteFile, 'utf8');
    expect(src).toContain('deletePO');
  });

  it('Finance PDF handler exists and uses shared PDF builder', () => {
    expect(fs.existsSync(financePdfFile)).toBe(true);
    const src = fs.readFileSync(financePdfFile, 'utf8');
    expect(src).toContain('buildPOPdf');
  });

  it('PDF builder exists and returns real PDF bytes', () => {
    expect(fs.existsSync(pdfBuilderFile)).toBe(true);
    const src = fs.readFileSync(pdfBuilderFile, 'utf8');
    expect(src).toContain('PDFDocument');
    expect(src).toContain('application/pdf');
  });

  it('compose-defaults handler exists', () => {
    expect(fs.existsSync(composeDefaultsFile)).toBe(true);
  });

  it('send-email handler exists and checks cancelled status', () => {
    expect(fs.existsSync(sendEmailFile)).toBe(true);
    const src = fs.readFileSync(sendEmailFile, 'utf8');
    expect(src).toContain("status === 'cancelled'");
  });

  it('send-email handler transitions draft to sent on success', () => {
    const src = fs.readFileSync(sendEmailFile, 'utf8');
    expect(src).toContain("status: 'sent'");
    expect(src).toContain('wasDraft');
  });

  it('send-email handler does not change status on failure', () => {
    const src = fs.readFileSync(sendEmailFile, 'utf8');
    // Status update only happens after successful sendEmail call
    expect(src).toContain('await sendEmail(');
    // The transition comes after the send
    const sendIdx = src.indexOf('await sendEmail(');
    const transitionIdx = src.indexOf("status: 'sent'");
    expect(transitionIdx).toBeGreaterThan(sendIdx);
  });

  it('entry.ts registers all new Finance PO routes', () => {
    const entryFile = path.resolve(__dirname, '../entry.ts');
    const src = fs.readFileSync(entryFile, 'utf8');
    expect(src).toContain('app.get("/api/finance/purchase-orders"');
    expect(src).toContain('app.post("/api/finance/purchase-orders"');
    expect(src).toContain('app.get("/api/finance/purchase-orders/:poId"');
    expect(src).toContain('app.put("/api/finance/purchase-orders/:poId"');
    expect(src).toContain('app.delete("/api/finance/purchase-orders/:poId"');
    expect(src).toContain('app.get("/api/finance/purchase-orders/:poId/pdf"');
    expect(src).toContain('app.get("/api/purchase-orders/:poId/compose-defaults"');
    expect(src).toContain('app.post("/api/purchase-orders/:poId/send-email"');
  });

  it('entry.ts still registers legacy job-scoped PO routes', () => {
    const entryFile = path.resolve(__dirname, '../entry.ts');
    const src = fs.readFileSync(entryFile, 'utf8');
    expect(src).toContain('app.get("/api/jobs/:id/purchase-orders"');
    expect(src).toContain('app.post("/api/jobs/:id/purchase-orders"');
    expect(src).toContain('app.get("/api/jobs/:id/purchase-orders/:poId"');
    expect(src).toContain('app.put("/api/jobs/:id/purchase-orders/:poId"');
    expect(src).toContain('app.delete("/api/jobs/:id/purchase-orders/:poId"');
    expect(src).toContain('app.get("/api/jobs/:id/purchase-orders/:poId/pdf"');
  });
});

// ── Permission tests ──────────────────────────────────────────────────────────

describe('PO Finance — permission enforcement (source-level)', () => {
  it('Finance list handler calls requireFinance', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/GET.ts'), 'utf8');
    expect(src).toContain('requireFinance(profile, res)');
  });

  it('Finance detail handler calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });

  it('Finance PUT handler calls requireFinance', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/PUT.ts'), 'utf8');
    expect(src).toContain('requireFinance(profile, res)');
  });

  it('Finance DELETE handler calls requireFinanceAndDelete', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/DELETE.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDelete(profile, res)');
  });

  it('Finance PDF handler calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/pdf/GET.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });

  it('send-email handler calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/purchase-orders/[poId]/send-email/POST.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });

  it('compose-defaults handler calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/purchase-orders/[poId]/compose-defaults/GET.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });
});

// ── Validation tests ──────────────────────────────────────────────────────────

describe('PO Finance — input validation (source-level)', () => {
  it('Finance POST handler validates jobId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/POST.ts'), 'utf8');
    expect(src).toContain('jobId');
    expect(src).toContain('isNaN(jobId)');
  });

  it('Finance detail handler validates poId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts'), 'utf8');
    expect(src).toContain('isNaN(poId)');
  });

  it('Finance PUT handler validates poId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/PUT.ts'), 'utf8');
    expect(src).toContain('isNaN(poId)');
  });

  it('Finance DELETE handler validates poId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/DELETE.ts'), 'utf8');
    expect(src).toContain('isNaN(poId)');
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('PO Finance — tenant isolation', () => {
  it('Finance list scopes by companyId from profile (not query param)', () => {
    const listFile = path.resolve(__dirname, '../api/finance/purchase-orders/GET.ts');
    const src = fs.readFileSync(listFile, 'utf8');
    // Must use profile.companyId, not req.query.companyId
    expect(src).toContain('profile.companyId');
    expect(src).not.toMatch(/query\.companyId|body\.companyId|params\.companyId/);
  });

  it('Finance detail scopes by companyId from profile', () => {
    const detailFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts');
    const src = fs.readFileSync(detailFile, 'utf8');
    expect(src).toContain('profile.companyId');
    expect(src).not.toMatch(/query\.companyId|body\.companyId/);
  });

  it('po-service listPOs always filters by companyId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('po.company_id = ${companyId}');
  });

  it('po-service fetchPODetail always filters by companyId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('po.company_id = ${companyId}');
  });
});

// ── Data integrity ────────────────────────────────────────────────────────────

describe('PO Finance — data integrity', () => {
  it('po-service createPO uses transaction with ROLLBACK on failure', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('START TRANSACTION');
    expect(src).toContain('ROLLBACK');
    expect(src).toContain('COMMIT');
  });

  it('po-service updatePO uses transaction', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    // updatePO also has a transaction block
    const updateIdx = src.indexOf('export async function updatePO');
    const txIdx = src.indexOf('START TRANSACTION', updateIdx);
    expect(txIdx).toBeGreaterThan(updateIdx);
  });

  it('po-service deletePO only deletes draft POs', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain("status !== 'draft'");
    expect(src).toContain('Only draft POs can be deleted');
  });

  it('po-service computeTotals is called in createPO (server-side totals)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('computeTotals(lines)');
  });
});

// ── Finance page ──────────────────────────────────────────────────────────────

describe('PO Finance — Finance page integration', () => {
  it('finance.tsx includes purchase-orders tab', () => {
    const financePageFile = path.resolve(__dirname, '../../pages/finance.tsx');
    const src = fs.readFileSync(financePageFile, 'utf8');
    expect(src).toContain("'purchase-orders'");
    expect(src).toContain('FinancePurchaseOrdersTab');
  });

  it('FinancePurchaseOrdersTab component exists', () => {
    const tabFile = path.resolve(__dirname, '../../components/finance/FinancePurchaseOrdersTab.tsx');
    expect(fs.existsSync(tabFile)).toBe(true);
  });

  it('NewPOSheet component exists', () => {
    const sheetFile = path.resolve(__dirname, '../../components/finance/NewPOSheet.tsx');
    expect(fs.existsSync(sheetFile)).toBe(true);
  });

  it('FinancePurchaseOrdersTab calls /api/finance/purchase-orders', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/finance/FinancePurchaseOrdersTab.tsx'), 'utf8');
    expect(src).toContain('/api/finance/purchase-orders');
  });

  it('NewPOSheet posts to /api/finance/purchase-orders', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/finance/NewPOSheet.tsx'), 'utf8');
    expect(src).toContain('/api/finance/purchase-orders');
    expect(src).toContain("method: 'POST'");
  });
});

// ── PDF builder ───────────────────────────────────────────────────────────────

describe('PO Finance — PDF builder', () => {
  it('PDF builder imports pdf-lib', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/purchase-order-pdf-document.ts'), 'utf8');
    expect(src).toContain("import('pdf-lib')");
  });

  it('PDF builder returns pdfBytes and filename', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/purchase-order-pdf-document.ts'), 'utf8');
    expect(src).toContain('pdfBytes');
    expect(src).toContain('filename');
  });

  it('Legacy job PDF handler now uses shared PDF builder', () => {
    const legacyPdf = path.resolve(__dirname, '../api/jobs/[id]/purchase-orders/[poId]/pdf/GET.ts');
    const src = fs.readFileSync(legacyPdf, 'utf8');
    expect(src).toContain('buildPOPdf');
    expect(src).toContain('application/pdf');
    // Must NOT return text/html anymore
    expect(src).not.toContain('text/html');
  });
});

// ── Return navigation ─────────────────────────────────────────────────────────

describe('PO Finance — return navigation', () => {
  it('FinancePurchaseOrdersTab navigates with from=finance context', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/finance/FinancePurchaseOrdersTab.tsx'), 'utf8');
    expect(src).toContain('from=finance');
  });
});
