import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../JobSwmsTab', () => ({
  default: ({ initialJobId }: { initialJobId?: number | null }) => (
    <div data-testid="job-safety-documents" data-job-id={initialJobId ?? ''}>
      Job safety documents
    </div>
  ),
}));

import SafetyContent from '../SafetyContent';

const templates = [
  {
    id: 12,
    name: 'Environmental Policy',
    template_type: 'policy',
    is_active: true,
  },
];

function renderSafety(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/safety${search}`]}>
      <SafetyContent />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return {
      ok: true,
      json: async () => url === '/api/document-templates' ? { templates } : {},
    } as Response;
  }));
});

describe('Safety two-tab navigation', () => {
  it('defaults to Document Templates and shows exactly the two approved tabs', async () => {
    renderSafety();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Document Templates',
      'Safety Documents',
    ]);
    expect(screen.getByRole('tab', { name: 'Document Templates' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Environmental Policy')).toBeInTheDocument();
    expect(screen.queryByTestId('job-safety-documents')).not.toBeInTheDocument();
  });

  it('loads company templates from the existing authenticated endpoint', async () => {
    renderSafety();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/document-templates', {
        credentials: 'include',
      });
    });
  });

  it('opens the existing job safety-document view from Safety Documents', () => {
    renderSafety();

    fireEvent.click(screen.getByRole('tab', { name: 'Safety Documents' }));

    expect(screen.getByTestId('job-safety-documents')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Safety Documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('passes an optional jobId into the job safety-document view', () => {
    renderSafety('?safetyTab=documents&jobId=42');

    expect(screen.getByTestId('job-safety-documents')).toHaveAttribute('data-job-id', '42');
  });

  it('does not restore any removed Safety tabs', () => {
    renderSafety();

    for (const label of [
      'Submissions',
      'SWMS',
      'Safety Plans',
      'Policies & Docs',
      'Doc Submissions',
      'Policy Library',
    ]) {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument();
    }
  });
});

describe('legacy Safety links', () => {
  it('redirects the old submissions link to Safety Documents', async () => {
    renderSafety('?safetyTab=submissions');

    await waitFor(() => {
      expect(screen.getByTestId('job-safety-documents')).toBeInTheDocument();
    });
  });

  it.each(['swms', 'plans', 'policies', 'doc-submissions', 'library'])(
    'redirects %s to Document Templates',
    async (legacyTab) => {
      renderSafety(`?safetyTab=${legacyTab}`);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Document Templates' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      });
      expect(await screen.findByText('Environmental Policy')).toBeInTheDocument();
    },
  );

  it('falls back to Document Templates for an unknown link', async () => {
    renderSafety('?safetyTab=unknown');

    expect(await screen.findByText('Environmental Policy')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Document Templates' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('Safety migration compatibility', () => {
  it('keeps the existing idempotent migration call', async () => {
    renderSafety();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/migrate-safety', {
        method: 'POST',
        credentials: 'include',
      });
    });
  });
});
