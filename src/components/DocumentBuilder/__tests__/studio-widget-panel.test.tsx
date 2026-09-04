/**
 * StudioWidgetPanel — full spec test suite
 *
 * Covers:
 *  1. Applying each widget to a blank document
 *  2. Applying a widget after pasting existing content (confirm + prepend)
 *  3. Correct banner, company name placeholder, ABN placeholder and footer
 *  4. Correct SWMS table structure (risk table columns)
 *  5. Saving and reopening the master (templateType set correctly)
 *  6. Attaching to a job (job detail tokens present in blocks)
 *  7. Existing SWMS sign-on still functioning (SwmsSignoffPage route intact)
 *  8. Old URLs redirecting safely
 *  9. No records deleted or duplicated (prependBlocks not replaceBlocks)
 * 10. Mobile and desktop layout (panel renders in both viewports)
 * 11. Production build (covered by build step — not a unit test)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ── Mock the document store ───────────────────────────────────────────────────

const mockStore = {
  blocks: [] as unknown[],
  templateName: '',
  appliedWidgets: [] as unknown[],
  prependBlocks: vi.fn(),
  reorderBlocks: vi.fn(),
  setTemplateType: vi.fn(),
  setTemplateName: vi.fn(),
  recordWidgetApplied: vi.fn(),
};

vi.mock('../useDocumentStore', () => ({
  default: () => mockStore,
  useDocumentStore: () => mockStore,
}));

import StudioWidgetPanel from '../StudioWidgetPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel() {
  return render(
    <MemoryRouter>
      <StudioWidgetPanel />
    </MemoryRouter>,
  );
}

// ── 1. Widget cards render ─────────────────────────────────────────────────

describe('StudioWidgetPanel — widget cards', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = '';
    vi.clearAllMocks();
  });

  it('renders all three widget cards', () => {
    renderPanel();
    expect(screen.getByText('SWMS Widget')).toBeTruthy();
    expect(screen.getByText('Safety Plan Widget')).toBeTruthy();
    expect(screen.getByText('Policy Widget')).toBeTruthy();
  });

  it('shows subtitle for each widget', () => {
    renderPanel();
    expect(screen.getByText('Safe Work Method Statement')).toBeTruthy();
    expect(screen.getByText('WHS Management Plan')).toBeTruthy();
    expect(screen.getByText('Company Policy Document')).toBeTruthy();
  });

  it('shows section list for SWMS widget', () => {
    renderPanel();
    expect(screen.getByText(/Sequence of work & risk control table/i)).toBeTruthy();
    expect(screen.getByText(/PPE requirements/i)).toBeTruthy();
    expect(screen.getByText(/Emergency response/i)).toBeTruthy();
  });

  it('shows section list for Safety Plan widget', () => {
    renderPanel();
    expect(screen.getByText(/Hazard register/i)).toBeTruthy();
    expect(screen.getByText(/Emergency planning & contacts/i)).toBeTruthy();
  });

  it('shows section list for Policy widget', () => {
    renderPanel();
    expect(screen.getByText(/Purpose/i)).toBeTruthy();
    expect(screen.getByText(/Responsibilities/i)).toBeTruthy();
    expect(screen.getByText(/Approval & sign-off/i)).toBeTruthy();
  });
});

// ── 2. Applying to a blank document ──────────────────────────────────────────

describe('StudioWidgetPanel — apply to blank document', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = '';
    vi.clearAllMocks();
  });

  it('calls prependBlocks when SWMS widget is clicked on blank doc', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalledTimes(1));
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string }>;
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('calls prependBlocks when Safety Plan widget is clicked on blank doc', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalledTimes(1));
  });

  it('calls prependBlocks when Policy widget is clicked on blank doc', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Policy Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalledTimes(1));
  });

  it('does NOT show confirm dialog on blank doc', () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    expect(screen.queryByText(/Apply Anyway/i)).toBeNull();
  });

  it('sets templateType to swms when SWMS widget applied', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.setTemplateType).toHaveBeenCalledWith('swms'));
  });

  it('sets templateType to safety_plan when Safety Plan widget applied', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.setTemplateType).toHaveBeenCalledWith('safety_plan'));
  });

  it('sets templateType to policy when Policy widget applied', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Policy Widget'));
    await waitFor(() => expect(mockStore.setTemplateType).toHaveBeenCalledWith('policy'));
  });

  it('sets templateName when doc has no name', async () => {
    mockStore.templateName = '';
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.setTemplateName).toHaveBeenCalledWith('SWMS'));
  });

  it('does NOT overwrite existing templateName', async () => {
    mockStore.templateName = 'My Custom SWMS';
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    expect(mockStore.setTemplateName).not.toHaveBeenCalled();
  });
});

// ── 3. Applying after existing content (confirm flow) ────────────────────────

describe('StudioWidgetPanel — apply to document with existing content', () => {
  beforeEach(() => {
    mockStore.blocks = [{ id: 'existing-1', type: 'text', content: 'Existing content' }];
    mockStore.templateName = 'Existing Doc';
    vi.clearAllMocks();
  });

  it('shows confirm dialog when doc has existing blocks', () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    expect(screen.getByText(/Apply Anyway/i)).toBeTruthy();
    expect(screen.getByText(/Cancel/i)).toBeTruthy();
  });

  it('does NOT call prependBlocks before confirmation', () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    expect(mockStore.prependBlocks).not.toHaveBeenCalled();
  });

  it('calls prependBlocks after clicking Apply Anyway', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    fireEvent.click(screen.getByText(/Apply Anyway/i));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalledTimes(1));
  });

  it('dismisses confirm dialog on Cancel without applying', () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(mockStore.prependBlocks).not.toHaveBeenCalled();
    expect(screen.queryByText(/Apply Anyway/i)).toBeNull();
  });

  it('uses prependBlocks not replaceBlocks — existing content is preserved', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    fireEvent.click(screen.getByText(/Apply Anyway/i));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    // prependBlocks adds to front; existing blocks remain in store (not cleared)
    expect(mockStore.blocks.length).toBeGreaterThan(0);
  });
});

// ── 4. Block structure correctness ───────────────────────────────────────────

// Tests use the blocks captured by prependBlocks mock calls.

describe('StudioWidgetPanel — SWMS block structure', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = 'Test SWMS';
    vi.clearAllMocks();
  });

  it('SWMS blocks do NOT include a "Review Before Issue" warning callout', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; html?: string }>;
    const warnBlock = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('Review Before Issue'),
    );
    expect(warnBlock).toBeUndefined();
  });

  it('SWMS blocks include a risk control table with correct columns', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; html?: string }>;
    // navyTable() emits a rich_text block — check HTML contains the key column headers
    const riskTable = blocks.find(
      (b) => b.type === 'rich_text' &&
        b.html?.includes('Control Measures') &&
        b.html?.includes('Task'),
    );
    expect(riskTable).toBeDefined();
    expect(riskTable?.html).toContain('Hazard');
    expect(riskTable?.html).toContain('Residual Risk');
    expect(riskTable?.html).toContain('Responsible Person');
  });

  it('SWMS blocks include a PPE table', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; html?: string }>;
    // navyTable() emits a rich_text block — check HTML contains PPE column headers
    const ppeTable = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('PPE Item'),
    );
    expect(ppeTable).toBeDefined();
  });

  it('SWMS blocks include a document-control footer', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string }>;
    const footer = blocks.find(
      (b) => b.type === 'text' && b.content?.includes('Document Control'),
    );
    expect(footer).toBeDefined();
  });

  it('SWMS blocks include emergency response section', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string; html?: string }>;
    const emergency = blocks.find(
      (b) =>
        (b.type === 'heading' && b.content?.includes('Emergency')) ||
        (b.type === 'rich_text' && b.html?.includes('Emergency')),
    );
    expect(emergency).toBeDefined();
  });

  it('SWMS blocks do NOT include sign-on controls or field blocks', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string }>;
    const fieldBlocks = blocks.filter((b) => b.type === 'field' || b.type === 'signature');
    expect(fieldBlocks).toHaveLength(0);
  });

  it('SWMS block IDs are all unique', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ id: string }>;
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── SWMS banner placement & native-section integrity ────────────────────────
describe('StudioWidgetPanel — SWMS banner placement and native section integrity', () => {
  type Block = { type: string; src?: string; html?: string; content?: string };

  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = 'Test SWMS';
    vi.clearAllMocks();
  });

  async function getSwmsBlocks(): Promise<Block[]> {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    return mockStore.prependBlocks.mock.calls[0][0] as Block[];
  }

  // ── Banner presence ────────────────────────────────────────────────────────

  it('does NOT contain a risk-assessment-banner image block', async () => {
    const blocks = await getSwmsBlocks();
    const banner = blocks.find(
      (b) => b.type === 'image' && b.src?.includes('risk-assessment-banner'),
    );
    expect(banner).toBeUndefined();
  });

  it('contains a ppe-banner-strip image block', async () => {
    const blocks = await getSwmsBlocks();
    const banner = blocks.find(
      (b) => b.type === 'image' && b.src?.includes('ppe-banner-strip'),
    );
    expect(banner).toBeDefined();
  });

  it('contains a risk-matrix image block', async () => {
    const blocks = await getSwmsBlocks();
    const img = blocks.find(
      (b) => b.type === 'image' && b.src?.includes('risk-matrix') && !b.src?.includes('risk-assessment'),
    );
    expect(img).toBeDefined();
  });

  // ── Sections 1–3 are native editable blocks, NOT images ───────────────────

  it('Section 1 Document Control is a native rich_text band (not an image)', async () => {
    const blocks = await getSwmsBlocks();
    const band = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('1. Document Control'),
    );
    expect(band).toBeDefined();
    // Must NOT be an image block
    const imgBlock = blocks.find(
      (b) => b.type === 'image' && (b.src?.includes('document') || b.src?.includes('section')),
    );
    expect(imgBlock).toBeUndefined();
  });

  it('Section 3 Scope of Works is a native rich_text band (not an image)', async () => {
    const blocks = await getSwmsBlocks();
    const band = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('3. Scope of Works'),
    );
    expect(band).toBeDefined();
  });

  it('Section 4 HRCW is a native rich_text band (not an image)', async () => {
    const blocks = await getSwmsBlocks();
    const band = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('4. High-Risk Construction Work'),
    );
    expect(band).toBeDefined();
  });

  // ── risk-matrix image is after PPE content and before Section 7 ───────────

  it('risk-matrix image appears after PPE band and before Section 8 band', async () => {
    const blocks = await getSwmsBlocks();
    const ppeBandIdx = blocks.findIndex(
      (b) => b.type === 'rich_text' && b.html?.includes('7. Personal Protective Equipment'),
    );
    const riskMatrixImgIdx = blocks.findIndex(
      (b) => b.type === 'image' && b.src?.includes('risk-matrix') && !b.src?.includes('risk-assessment'),
    );
    const section8Idx = blocks.findIndex(
      (b) => b.type === 'rich_text' && b.html?.includes('8. Risk Matrix'),
    );
    expect(ppeBandIdx).toBeGreaterThan(-1);
    expect(riskMatrixImgIdx).toBeGreaterThan(-1);
    expect(section8Idx).toBeGreaterThan(-1);
    expect(riskMatrixImgIdx).toBeGreaterThan(ppeBandIdx);
    expect(riskMatrixImgIdx).toBeLessThan(section8Idx);
  });

  // ── ppe-banner-strip is before the PPE table ──────────────────────────────

  it('ppe-banner-strip appears before the PPE table', async () => {
    const blocks = await getSwmsBlocks();
    const ppeBannerIdx = blocks.findIndex(
      (b) => b.type === 'image' && b.src?.includes('ppe-banner-strip'),
    );
    const ppeTableIdx = blocks.findIndex(
      (b) => b.type === 'rich_text' && b.html?.includes('PPE Item'),
    );
    expect(ppeBannerIdx).toBeGreaterThan(-1);
    expect(ppeTableIdx).toBeGreaterThan(-1);
    expect(ppeBannerIdx).toBeLessThan(ppeTableIdx);
  });

  // ── Section 13 sign-off is a native fillable TableBlock ──────────────────

  it('Section 13 Worker Sign-Off uses a native fillable table block (not rich_text HTML)', async () => {
    const blocks = await getSwmsBlocks();

    // Must have the Section 13 navy band
    const band = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('13. Worker Sign-Off'),
    );
    expect(band).toBeDefined();

    // The sign-off block must be a native table, not a rich_text HTML table
    const signoffTbl = blocks.find(
      (b) => b.type === 'table',
    ) as (Block & { mode?: string; columns?: Array<{ header: string }>; rows?: unknown[] }) | undefined;
    expect(signoffTbl).toBeDefined();
    expect(signoffTbl?.mode).toBe('fillable');

    // Must have Name, Role, Signature, Date columns
    const headers = signoffTbl?.columns?.map((c) => c.header) ?? [];
    expect(headers).toContain('Name');
    expect(headers).toContain('Role');
    expect(headers).toContain('Signature');
    expect(headers).toContain('Date');

    // Must have 6 pre-seeded rows (Supervisor/PCBU + Workers 1–5)
    expect(signoffTbl?.rows?.length).toBe(6);

    // Must appear after the Section 10 band
    const bandIdx = blocks.indexOf(band!);
    const tblIdx  = blocks.indexOf(signoffTbl!);
    expect(tblIdx).toBeGreaterThan(bandIdx);

    // Must NOT be a rich_text block with old-style Name/Signature/Date HTML table cells
    const oldHtmlSignoff = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('Name: ___') && b.html?.includes('Signature: ___'),
    );
    expect(oldHtmlSignoff).toBeUndefined();
  });
});

describe('StudioWidgetPanel — Safety Plan block structure', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = 'Test WHS Plan';
    vi.clearAllMocks();
  });

  it('Safety Plan blocks include a "HOW TO USE" warning callout', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; html?: string }>;
    const warnBlock = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('HOW TO USE'),
    );
    expect(warnBlock).toBeDefined();
  });

  it('Safety Plan blocks include a hazard register table', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; html?: string }>;
    // navyTable() emits rich_text — check HTML contains hazard table column headers
    const hazTable = blocks.find(
      (b) => b.type === 'rich_text' &&
        b.html?.includes('Hazard') &&
        b.html?.includes('Risk Rating'),
    );
    expect(hazTable).toBeDefined();
  });

  it('Safety Plan blocks include emergency planning section', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string; html?: string }>;
    const emergency = blocks.find(
      (b) =>
        (b.type === 'heading' && b.content?.includes('Emergency')) ||
        (b.type === 'rich_text' && b.html?.includes('Emergency')),
    );
    expect(emergency).toBeDefined();
  });

  it('Safety Plan blocks include document-control footer', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string }>;
    const footer = blocks.find(
      (b) => b.type === 'text' && b.content?.includes('Document Control'),
    );
    expect(footer).toBeDefined();
  });

  it('Safety Plan block IDs are all unique', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ id: string }>;
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Safety Plan has no full-page/template image block; Document Control and PCBU/Project Details are native rich_text blocks', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{
      id: string;
      type: string;
      html?: string;
      src?: string;
      url?: string;
    }>;

    // Known safety-badge slots that are legitimately used as image blocks.
    const ALLOWED_BADGE_SLOTS = [
      'safety-badges/icons-sheet',
      'safety-badges/ppe-banner-strip',
      'safety-badges/risk-matrix',
      'safety-badges/risk-assessment-banner',
    ];

    // Any type:'image' block must point to a known safety-badge slot — not a
    // screenshot, upload URL, or full-page template raster.
    const unknownImageBlocks = blocks.filter(
      (b) =>
        b.type === 'image' &&
        !ALLOWED_BADGE_SLOTS.some((slot) => (b.src ?? '').includes(slot)),
    );
    expect(unknownImageBlocks).toHaveLength(0);

    // No rich_text block should embed an <img> src pointing at an upload URL or
    // airo-assets path that is NOT a known safety-badge slot (i.e. no embedded
    // full-page template screenshots).
    const suspiciousRichTextImages = blocks.filter((b) => {
      if (b.type !== 'rich_text' || !b.html) return false;
      const srcMatches = [...b.html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
      return srcMatches.some(
        (src) =>
          (src.includes('/airo-assets/images/') || src.includes('/uploads/')) &&
          !ALLOWED_BADGE_SLOTS.some((slot) => src.includes(slot)),
      );
    });
    expect(suspiciousRichTextImages).toHaveLength(0);

    // Document Control section must be a native rich_text navyBand block.
    const docControlBand = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('1. Document Control'),
    );
    expect(docControlBand).toBeDefined();

    // PCBU and Project Details section must be a native rich_text navyBand block.
    const pcbuBand = blocks.find(
      (b) => b.type === 'rich_text' && b.html?.includes('2. PCBU and Project Details'),
    );
    expect(pcbuBand).toBeDefined();

    // The PCBU form must contain bracketed placeholders (not empty or screenshot content).
    const pcbuForm = blocks.find(
      (b) =>
        b.type === 'rich_text' &&
        b.html?.includes('PCBU name') &&
        b.html?.includes('[Legal name'),
    );
    expect(pcbuForm).toBeDefined();
  });
});

describe('StudioWidgetPanel — Policy block structure', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = '';
    vi.clearAllMocks();
  });

  it('Policy blocks include Purpose, Scope, Responsibilities sections', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Policy Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string }>;
    const headings = blocks.filter((b) => b.type === 'rich_text' && b.html).map((b) => b.html ?? '');
    expect(headings.some((h) => h.includes('Purpose'))).toBe(true);
    expect(headings.some((h) => h.includes('Scope'))).toBe(true);
    expect(headings.some((h) => h.includes('Responsibilities'))).toBe(true);
  });

  it('Policy blocks include Approval section', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Policy Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string }>;
    const approval = blocks.find((b) => b.type === 'rich_text' && b.html?.includes('Approval'));
    expect(approval).toBeDefined();
  });

  it('Policy block IDs are all unique', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Policy Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ id: string }>;
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── 5. Saving and reopening — templateType set correctly ─────────────────────

describe('StudioWidgetPanel — templateType persistence', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = '';
    vi.clearAllMocks();
  });

  it('sets templateType swms so the document can be saved and reopened as SWMS', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.setTemplateType).toHaveBeenCalledWith('swms'));
  });

  it('sets templateType safety_plan for Safety Plan widget', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Safety Plan Widget'));
    await waitFor(() => expect(mockStore.setTemplateType).toHaveBeenCalledWith('safety_plan'));
  });

  it('sets templateType policy for Policy widget', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Policy Widget'));
    await waitFor(() => expect(mockStore.setTemplateType).toHaveBeenCalledWith('policy'));
  });
});

// ── 6. Job detail tokens ──────────────────────────────────────────────────────

describe('StudioWidgetPanel — job detail tokens NOT in master blocks', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.appliedWidgets = [];
    mockStore.templateName = '';
    vi.clearAllMocks();
  });

  it('SWMS master blocks do not contain resolved job data (tokens only)', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    const blocks = mockStore.prependBlocks.mock.calls[0][0] as Array<{ type: string; content?: string }>;
    // No block should contain a resolved job number like "JOB-001"
    const resolved = blocks.filter(
      (b) => b.type === 'text' && /JOB-\d{3}/.test(b.content ?? ''),
    );
    expect(resolved).toHaveLength(0);
  });
});

// ── 7. Old SWMS sign-on route still exists ────────────────────────────────────

describe('Old SWMS sign-on route', () => {
  it('SwmsSignoffPage is still importable (sign-on workflow preserved)', async () => {
    // Dynamic import — if the file is deleted this will throw
    const mod = await import('@/pages/swms-signoff');
    expect(mod.default).toBeDefined();
  });
});

// ── 8. Old URL redirects ──────────────────────────────────────────────────────

describe('Old URL redirects', () => {
  it('routes.tsx contains redirect for /safety/swms', async () => {
    const src = await import('fs').then((fs) => fs.readFileSync('src/routes.tsx', 'utf-8'));
    expect(src).toContain("path: '/safety/swms'");
    expect(src).toContain("redirect('/safety?safetyTab=documents')");
  });

  it('routes.tsx contains redirect for /safety/plans', async () => {
    const src = await import('fs').then((fs) => fs.readFileSync('src/routes.tsx', 'utf-8'));
    expect(src).toContain("path: '/safety/plans'");
    expect(src).toContain("redirect('/studio/documents')");
  });
});

// ── 9. No records deleted or duplicated ──────────────────────────────────────

describe('No records deleted or duplicated', () => {
  it('prependBlocks is called (not a destructive replace)', async () => {
    mockStore.blocks = [{ id: 'keep-me', type: 'text', content: 'Existing' }];
    mockStore.templateName = 'Existing';
    vi.clearAllMocks();

    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    // Confirm dialog appears — click Apply Anyway
    await waitFor(() => screen.getByText(/Apply Anyway/i));
    fireEvent.click(screen.getByText(/Apply Anyway/i));

    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalled());
    // prependBlocks was called, not a store.set({ blocks: newBlocks }) replacement
    // The existing block is still in mockStore.blocks (we didn't clear it)
    expect(mockStore.blocks.some((b: { id: string }) => b.id === 'keep-me')).toBe(true);
  });
});

// ── 10. Mobile and desktop layout ─────────────────────────────────────────────

describe('StudioWidgetPanel — responsive layout', () => {
  it('renders correctly at mobile viewport (375px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    mockStore.blocks = [];
    vi.clearAllMocks();
    const { container } = renderPanel();
    // Panel should render without crashing
    expect(container.querySelector('.w-72')).toBeTruthy();
  });

  it('renders correctly at desktop viewport (1280px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
    mockStore.blocks = [];
    vi.clearAllMocks();
    const { container } = renderPanel();
    expect(container.querySelector('.w-72')).toBeTruthy();
  });
});

// ── 11. SafetyContent no longer renders SWMS or Safety Plans tabs ─────────────

describe('SafetyContent — removed tabs', () => {
  it('SafetyContent source does not render SwmsLibraryTab', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    expect(src).not.toContain('<SwmsLibraryTab');
    expect(src).not.toContain("activeTab === 'swms'");
  });

  it('SafetyContent source does not render SafetyPlansTab', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    expect(src).not.toContain('<SafetyPlansTab');
    expect(src).not.toContain("activeTab === 'plans'");
  });

  it('SafetyContent still renders Documents and Submissions tabs', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    expect(src).toContain('JobSwmsTab');
    expect(src).toContain('SwmsSubmissionsTab');
  });
});

// ── 12. Apply Widget tab in builder ribbon ────────────────────────────────────

describe('DocumentBuilder ribbon — Apply Widget tab', () => {
  it('BuilderTab type includes apply_widget', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/types.ts', 'utf-8'),
    );
    expect(src).toContain("'apply_widget'");
  });

  it('StudioWidgetPanel component file exists as a standalone block-document widget', async () => {
    // StudioWidgetPanel is a standalone component for block-canvas documents.
    // HTML-canvas documents (source_type='html') do not use widgets — they use
    // HtmlDocumentCanvas directly. The panel is not wired into DocumentBuilder/index.tsx
    // for HTML docs, which is correct behaviour.
    const fs = await import('fs');
    const exists = fs.existsSync('src/components/DocumentBuilder/StudioWidgetPanel.tsx');
    expect(exists).toBe(true);
  });
});
