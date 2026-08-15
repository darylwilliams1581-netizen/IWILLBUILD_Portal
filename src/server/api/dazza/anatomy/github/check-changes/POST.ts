/**
 * POST /api/dazza/anatomy/github/check-changes
 * Platform-owner only. Checks if there are new commits since a known SHA.
 */
import type { Request, Response } from 'express';
import { checkForChanges, ALLOWED_REPO } from '../../../../../lib/anatomy-github.js';

export default async function handler(req: Request, res: Response) {
  const { branch = ALLOWED_REPO.defaultBranch, knownSha = '' } = req.body as {
    branch?: string;
    knownSha?: string;
  };

  try {
    const result = await checkForChanges(branch, knownSha);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e).slice(0, 300) });
  }
}
