/**
 * /library — Developer-Controlled Content Library
 *
 * Route responsibilities only:
 *   - Helmet and page metadata
 *   - Redirect: /library → /studio/library
 *   - Named export aliases for backwards compatibility
 *
 * Reusable Library UI lives in:
 *   src/features/library/LibraryView.tsx
 *
 * Consumers that import { LibraryPage } from '@/pages/library' continue to
 * work unchanged — LibraryPage is re-exported from LibraryView here.
 */

import { Navigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { LibraryView } from '../features/library/LibraryView';

// ── Named export: LibraryPage ─────────────────────────────────────────────────
// Re-exported so all existing consumers keep working without import changes.
// Alias matches the original function name used across the codebase.
export { LibraryView as LibraryPage };

// ── Named export: LibraryContent ─────────────────────────────────────────────
// studio-library.tsx imports as `LibraryPage as LibraryContent` — this alias
// is kept for any consumer that imports LibraryContent directly.
export { LibraryView as LibraryContent };

// ── /library route — redirect to Studio Library ───────────────────────────────
export default function LibraryRedirect() {
  return (
    <>
      <Helmet>
        <title>Library — IWIllBUILD</title>
        <meta
          name="description"
          content="Browse and install safety, compliance and document templates for your trades business."
        />
        <link rel="canonical" href="https://iwillbuild.com/library" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <h1 className="sr-only">Library</h1>
      <Navigate to="/studio?tab=library" replace />
    </>
  );
}
