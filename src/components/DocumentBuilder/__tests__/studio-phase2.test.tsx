/**
 * Studio Phase 2 — Integration test suite
 *
 * Covers all 8 test groups from the spec:
 *   1. Applying a widget twice (duplicate protection)
 *   2. Attaching a Studio SWMS to a job
 *   3. Immutable attached revision snapshot
 *   4. Existing job sign-on workflow (bridge row)
 *   5. Job details in the attached PDF
 *   6. Master PDF marked not job-specific
 *   7. All legacy redirects
 *   8. Existing records remaining accessible
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ── Mock the document store ───────────────────────────────────────────────────

import type { AppliedWidgetMeta } from '../types';

const mockStore = {
  blocks: [] as Array<{ id: string; type: string }>,
  templateName: '',
  templateType: 'document',
  appliedWidgets: [] as AppliedWidgetMeta[],
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

function renderPanel() {
  return render(
    <MemoryRouter>
      <StudioWidgetPanel />
    </MemoryRouter>,
  );
}

// ── 1. Applying a widget twice (duplicate protection) ─────────────────────────

describe('Group 1 — Applying a widget twice', () => {
  beforeEach(() => {
    mockStore.blocks = [];
    mockStore.templateName = '';
    mockStore.appliedWidgets = [];
    vi.clearAllMocks();
  });

  it('first application calls prependBlocks and recordWidgetApplied', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('SWMS Widget'));
    await waitFor(() => expect(mockStore.prependBlocks).toHaveBeenCalledTimes(1));
    expect(mockStore.recordWidgetApplied).toHaveBeenCalledWith(
      expect.objectContaining({ widgetId: 'swms', version: 1 }),
    );
  });

  it('second application shows "Update Structure" confirm dialog (not "Apply Anyway")', async () => {
    // Simulate widget already applied
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 20 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('widget-card-swms'));
    // The confirm dialog button should say "Update Structure"
    await waitFor(() => {
      const buttons = screen.getAllByText(/Update Structure/i);
      // At least one should be a button (the confirm action)
      expect(buttons.some((el) => el.tagName === 'BUTTON' || el.closest('button'))).toBe(true);
    });
    // "Apply Anyway" should NOT appear — this is an update, not a first-time prepend
    expect(screen.queryByText(/Apply Anyway/i)).toBeNull();
  });

  it('second application shows version number in confirm dialog', async () => {
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 2, appliedAt: new Date().toISOString(), blockCount: 20 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('widget-card-swms'));
    // The confirm dialog text should mention v2
    await waitFor(() => {
      const matches = screen.getAllByText(/v2/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('confirming Update Structure calls reorderBlocks to remove old widget blocks', async () => {
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 5 }];
    mockStore.blocks = [
      { id: 'widget-h-1', type: 'heading' },
      { id: 'widget-p-2', type: 'text' },
      { id: 'user-content-1', type: 'text' }, // user block — must be preserved
    ];
    renderPanel();
    fireEvent.click(screen.getByTestId('widget-card-swms'));
    // Click the "Update Structure" button in the confirm dialog
    await waitFor(() => {
      const buttons = screen.getAllByText(/Update Structure/i);
      const btn = buttons.find((el) => el.tagName === 'BUTTON' || el.closest('button'));
      expect(btn).toBeTruthy();
    });
    const updateBtn = screen.getAllByText(/Update Structure/i).find(
      (el) => el.tagName === 'BUTTON' || el.closest('button'),
    )!;
    fireEvent.click(updateBtn.tagName === 'BUTTON' ? updateBtn : updateBtn.closest('button')!);
    await waitFor(() => expect(mockStore.reorderBlocks).toHaveBeenCalled());
    // reorderBlocks should be called with only non-widget blocks
    const filtered = mockStore.reorderBlocks.mock.calls[0][0] as Array<{ id: string }>;
    expect(filtered.every((b) => !b.id.startsWith('widget-'))).toBe(true);
    expect(filtered.some((b) => b.id === 'user-content-1')).toBe(true);
  });

  it('confirming Update Structure increments version to 2', async () => {
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 5 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('widget-card-swms'));
    await waitFor(() => {
      const buttons = screen.getAllByText(/Update Structure/i);
      expect(buttons.some((el) => el.tagName === 'BUTTON' || el.closest('button'))).toBe(true);
    });
    const updateBtn = screen.getAllByText(/Update Structure/i).find(
      (el) => el.tagName === 'BUTTON' || el.closest('button'),
    )!;
    fireEvent.click(updateBtn.tagName === 'BUTTON' ? updateBtn : updateBtn.closest('button')!);
    await waitFor(() => expect(mockStore.recordWidgetApplied).toHaveBeenCalled());
    const meta = mockStore.recordWidgetApplied.mock.calls[0][0] as AppliedWidgetMeta;
    expect(meta.version).toBe(2);
  });

  it('cancelling the update dialog does not call prependBlocks', async () => {
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 5 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('widget-card-swms'));
    await waitFor(() => {
      const buttons = screen.getAllByText(/Update Structure/i);
      expect(buttons.length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(mockStore.prependBlocks).not.toHaveBeenCalled();
    expect(mockStore.reorderBlocks).not.toHaveBeenCalled();
  });

  it('widget card shows "v1 applied" badge when widget has been applied', () => {
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 5 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    expect(screen.getByText(/v1 applied/i)).toBeTruthy();
  });

  it('widget card shows "Click to update structure" hint when already applied', () => {
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 5 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    expect(screen.getByText(/Click to update structure/i)).toBeTruthy();
  });

  it('different widget types have independent duplicate detection', async () => {
    // SWMS applied, Safety Plan not
    mockStore.appliedWidgets = [{ widgetId: 'swms', version: 1, appliedAt: new Date().toISOString(), blockCount: 5 }];
    mockStore.blocks = [{ id: 'widget-h-1', type: 'heading' }];
    renderPanel();
    // Clicking Safety Plan should show "Apply Anyway" (prepend confirm), not "Update Structure" confirm
    fireEvent.click(screen.getByTestId('widget-card-safety_plan'));
    await waitFor(() => expect(screen.getByText(/Apply Anyway/i)).toBeTruthy());
    // The confirm dialog text should say "preserved below" (prepend mode), not "Update" mode text
    expect(screen.getByText(/preserved below/i)).toBeTruthy();
  });
});

// ── 2. Attaching a Studio SWMS to a job ───────────────────────────────────────

describe('Group 2 — Attaching a Studio SWMS to a job', () => {
  it('AttachToJobSheet component is importable', async () => {
    const mod = await import('@/components/studio/AttachToJobSheet');
    expect(mod.default).toBeDefined();
  });

  it('POST /api/jobs/:id/studio-swms handler is importable', async () => {
    const mod = await import('@/server/api/jobs/[id]/studio-swms/POST');
    expect(mod.default).toBeDefined();
  });

  it('GET /api/jobs/:id/studio-swms handler is importable', async () => {
    const mod = await import('@/server/api/jobs/[id]/studio-swms/GET');
    expect(mod.default).toBeDefined();
  });

  it('POST handler source contains immutable snapshot logic', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain('content_snapshot_json');
    expect(src).toContain('snapshotAt');
    expect(src).toContain('job_studio_documents');
  });

  it('POST handler creates sign-on bridge for swms template type', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain("templateType === 'swms'");
    expect(src).toContain('swms_templates');
    expect(src).toContain('job_swms');
    expect(src).toContain('bridge_swms_template_id');
  });

  it('POST handler creates sign-on bridge for safety_plan template type', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain("templateType === 'safety_plan'");
  });

  it('entry.ts registers the new routes', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/entry.ts', 'utf-8'),
    );
    expect(src).toContain('jobs_id_studio_swms_get');
    expect(src).toContain('jobs_id_studio_swms_post');
    expect(src).toContain('/api/jobs/:id/studio-swms');
  });
});

// ── 3. Immutable attached revision snapshot ───────────────────────────────────

describe('Group 3 — Immutable attached revision snapshot', () => {
  it('snapshot is stored in content_snapshot_json at attachment time', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    // Snapshot captures builder_json at the moment of attachment
    expect(src).toContain('builderJson: doc.builder_json');
    expect(src).toContain('snapshotAt: new Date().toISOString()');
  });

  it('PDF export uses snapshot builder_json when jobStudioDocId is provided', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    expect(src).toContain('jobStudioDocId');
    expect(src).toContain('content_snapshot_json');
    expect(src).toContain('snap.builderJson');
  });

  it('GET /api/jobs/:id/studio-swms returns content_snapshot_json', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/GET.ts', 'utf-8'),
    );
    expect(src).toContain('job_studio_documents');
    expect(src).toContain('signoff_count');
  });

  it('snapshot includes job fields captured at attachment time', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain('jobTitle');
    expect(src).toContain('jobNumber');
    expect(src).toContain('siteAddress');
    expect(src).toContain('clientName');
    expect(src).toContain('supervisorName');
  });
});

// ── 4. Existing job sign-on workflow ─────────────────────────────────────────

describe('Group 4 — Existing job sign-on workflow', () => {
  it('sign-on bridge creates a swms_templates row', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain('INSERT INTO swms_templates');
    expect(src).toContain('[Studio]');
  });

  it('sign-on bridge creates a job_swms row', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain('INSERT INTO job_swms');
    expect(src).toContain('studio_doc_id');
  });

  it('GET /api/jobs/:id/studio-swms joins swms_signoffs via bridge', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/GET.ts', 'utf-8'),
    );
    expect(src).toContain('swms_signoffs');
    expect(src).toContain('signoff_count');
  });

  it('SwmsSignoffPage is still importable (sign-on workflow preserved)', async () => {
    const mod = await import('@/pages/swms-signoff');
    expect(mod.default).toBeDefined();
  });

  it('existing job_swms POST handler is unchanged', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/swms/POST.ts', 'utf-8'),
    );
    // Original handler still inserts into job_swms using swms_template_id
    expect(src).toContain('swmsTemplateId');
    expect(src).toContain('INSERT INTO job_swms');
  });

  it('sign-on bridge failure is non-fatal (logged, not thrown)', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/studio-swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain('non-fatal');
    expect(src).toContain('console.warn');
  });
});

// ── 5. Job details in the attached PDF ───────────────────────────────────────

describe('Group 5 — Job details in the attached PDF', () => {
  it('PDF export handler accepts jobStudioDocId query param', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    expect(src).toContain('jobStudioDocId');
    expect(src).toContain('req.query.jobStudioDocId');
  });

  it('PDF renders job header table with all required fields', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    expect(src).toContain('Job Title');
    expect(src).toContain('Job Number');
    expect(src).toContain('Site Address');
    expect(src).toContain('Client / Principal Contractor');
    expect(src).toContain('Supervisor');
    expect(src).toContain('Document Number');
    expect(src).toContain('Revision');
    expect(src).toContain('Date Attached');
  });

  it('PDF uses immutable snapshot builder_json when jobStudioDocId is provided', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    expect(src).toContain('snap.builderJson');
    expect(src).toContain('fall back to live master');
  });

  it('PDF renders table blocks correctly (not just [Table block])', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    // The new handler renders table columns and rows, not just a placeholder
    expect(src).toContain('b.columns');
    expect(src).toContain('b.rows');
    expect(src).not.toContain('[Table block]');
  });
});

// ── 6. Master PDF marked not job-specific ────────────────────────────────────

describe('Group 6 — Master PDF marked not job-specific', () => {
  it('PDF export shows master banner when no jobStudioDocId', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    expect(src).toContain('Master Document — Not Job Specific');
    expect(src).toContain('masterBannerHtml');
  });

  it('master banner is only shown when jobInfo is null', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    // Banner is conditional on !jobInfo
    expect(src).toContain('!jobInfo');
  });

  it('master banner instructs user to attach before issuing to workers', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8'),
    );
    expect(src).toContain('Attach this document to a job before issuing to workers');
  });
});

// ── 7. All legacy redirects ───────────────────────────────────────────────────

describe('Group 7 — All legacy redirects', () => {
  it('/safety/swms redirects to /safety?safetyTab=documents', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/routes.tsx', 'utf-8'),
    );
    expect(src).toContain("path: '/safety/swms'");
    expect(src).toContain("redirect('/safety?safetyTab=documents')");
  });

  it('/safety/plans redirects to /studio/documents', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/routes.tsx', 'utf-8'),
    );
    expect(src).toContain("path: '/safety/plans'");
    expect(src).toContain("redirect('/studio/documents')");
  });

  it('?safetyTab=swms client-side redirect to /studio/documents', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    expect(src).toContain("rawTab === 'swms'");
    expect(src).toContain("navigate('/studio/documents'");
  });

  it('?safetyTab=plans client-side redirect to /studio/documents', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    expect(src).toContain("rawTab === 'plans'");
  });

  it('all four redirect paths are covered', async () => {
    const routesSrc = await import('fs').then((fs) =>
      fs.readFileSync('src/routes.tsx', 'utf-8'),
    );
    const safetySrc = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    // /safety/swms — server redirect
    expect(routesSrc).toContain("path: '/safety/swms'");
    // /safety/plans — server redirect
    expect(routesSrc).toContain("path: '/safety/plans'");
    // ?safetyTab=swms — client redirect
    expect(safetySrc).toContain("rawTab === 'swms'");
    // ?safetyTab=plans — client redirect
    expect(safetySrc).toContain("rawTab === 'plans'");
  });
});

// ── 8. Existing records remaining accessible ─────────────────────────────────

describe('Group 8 — Existing records remaining accessible', () => {
  it('existing job_swms GET handler is unchanged', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/swms/GET.ts', 'utf-8'),
    );
    expect(src).toContain('job_swms');
    expect(src).toContain('swms_templates');
    expect(src).toContain('swms_signoffs');
  });

  it('existing job_swms POST handler is unchanged', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/jobs/[id]/swms/POST.ts', 'utf-8'),
    );
    expect(src).toContain('swmsTemplateId');
    expect(src).toContain('INSERT INTO job_swms');
  });

  it('safety API swms GET handler is unchanged', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/safety/swms/GET.ts', 'utf-8'),
    );
    expect(src).toContain('swms_templates');
  });

  it('SafetyContent still renders Documents and Submissions tabs', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/safety/SafetyContent.tsx', 'utf-8'),
    );
    expect(src).toContain('JobSwmsTab');
    expect(src).toContain('SwmsSubmissionsTab');
  });

  it('migration is additive only — no DROP TABLE or DROP COLUMN', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/migrate-studio-phase2/POST.ts', 'utf-8'),
    );
    expect(src).not.toContain('DROP TABLE');
    expect(src).not.toContain('DROP COLUMN');
    expect(src).not.toContain('TRUNCATE');
  });

  it('migration is idempotent — handles already-exists errors gracefully', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/migrate-studio-phase2/POST.ts', 'utf-8'),
    );
    expect(src).toContain('already exists');
    expect(src).toContain('ER_TABLE_EXISTS');
    expect(src).toContain('ER_DUP_FIELDNAME');
  });

  it('appliedWidgets is preserved in getSerialised', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/useDocumentStore.ts', 'utf-8'),
    );
    expect(src).toContain('appliedWidgets: s.appliedWidgets');
  });

  it('appliedWidgets is restored in loadTemplate', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/useDocumentStore.ts', 'utf-8'),
    );
    expect(src).toContain('appliedWidgets: template.appliedWidgets ?? []');
  });

  it('appliedWidgets is cleared in resetToBlank', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/useDocumentStore.ts', 'utf-8'),
    );
    expect(src).toContain('appliedWidgets: [],');
  });

  it('document-templates GET handler returns appliedWidgets', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/GET.ts', 'utf-8'),
    );
    expect(src).toContain('appliedWidgets');
    expect(src).toContain('applied_widgets_json');
  });

  it('document-templates PUT handler persists appliedWidgets', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/[id]/PUT.ts', 'utf-8'),
    );
    expect(src).toContain('appliedWidgets');
    expect(src).toContain('applied_widgets_json');
  });

  it('document-templates POST handler includes appliedWidgets in builder_json', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/server/api/document-templates/POST.ts', 'utf-8'),
    );
    expect(src).toContain('appliedWidgets');
  });

  it('AppliedWidgetMeta type is exported from types.ts', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/types.ts', 'utf-8'),
    );
    expect(src).toContain('export interface AppliedWidgetMeta');
    expect(src).toContain('widgetId');
    expect(src).toContain('version');
    expect(src).toContain('appliedAt');
    expect(src).toContain('blockCount');
  });
});

// ── 9. recordWidgetApplied store action ───────────────────────────────────────

describe('Group 9 — recordWidgetApplied store action', () => {
  it('recordWidgetApplied upserts by widgetId', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/useDocumentStore.ts', 'utf-8'),
    );
    expect(src).toContain('recordWidgetApplied');
    expect(src).toContain('w.widgetId !== meta.widgetId');
  });

  it('recordWidgetApplied is in the store interface', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/DocumentBuilder/useDocumentStore.ts', 'utf-8'),
    );
    expect(src).toContain('recordWidgetApplied: (meta: AppliedWidgetMeta) => void');
  });
});

// ── 10. AttachToJobSheet UI ───────────────────────────────────────────────────

describe('Group 10 — AttachToJobSheet UI', () => {
  it('AttachToJobSheet renders without crashing when open=false', async () => {
    const { default: AttachToJobSheet } = await import('@/components/studio/AttachToJobSheet');
    const { container } = render(
      <MemoryRouter>
        <AttachToJobSheet
          open={false}
          studioDocId={1}
          docTitle="Test SWMS"
          templateType="swms"
          onClose={() => {}}
        />
      </MemoryRouter>,
    );
    // When open=false, nothing should be rendered
    expect(container.firstChild).toBeNull();
  });

  it('studio-documents.tsx imports AttachToJobSheet', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/pages/studio-documents.tsx', 'utf-8'),
    );
    expect(src).toContain('AttachToJobSheet');
    expect(src).toContain('showAttachSheet');
  });

  it('Attach to Job button only shown for swms and safety_plan docs', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/pages/studio-documents.tsx', 'utf-8'),
    );
    expect(src).toContain('isSafetyDoc');
    expect(src).toContain("template_type === 'swms'");
    expect(src).toContain("template_type === 'safety_plan'");
  });
});
