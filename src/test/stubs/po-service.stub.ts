/**
 * Test stub for src/server/lib/po-service.ts
 * Used by entry.test.ts to prevent DB/auth imports from loading during test.
 */

export async function createPO() { return { ok: false, error: { code: 500, message: 'stub' } }; }
export async function updatePO() { return { ok: false, error: { code: 500, message: 'stub' } }; }
export async function deletePO() { return { ok: false, error: { code: 500, message: 'stub' } }; }
export async function listPOs() { return { purchaseOrders: [], hasMore: false, nextCursor: null, counts: { all: 0, draft: 0, sent: 0, completed: 0, cancelled: 0 } }; }
export async function fetchPODetail() { return null; }
export async function fetchPOForPdf() { return null; }
export async function nextPONumber() { return 'PO-0001'; }
export async function validateVendor() { return { ok: true }; }
export async function validateJob() { return { ok: true }; }
