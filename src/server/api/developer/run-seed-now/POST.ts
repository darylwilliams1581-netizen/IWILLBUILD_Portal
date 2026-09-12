/**
 * POST /api/developer/run-seed-now
 *
 * DISABLED — this endpoint was replaced by /api/developer/seed-safety-documents
 * which correctly targets document_templates (the Document Builder destination)
 * instead of swms_templates.
 *
 * Returns 410 Gone so any cached call fails loudly rather than silently
 * inserting into the wrong table.
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'Gone',
    message:
      'run-seed-now has been disabled. Use POST /api/developer/seed-safety-documents instead.',
  });
}
