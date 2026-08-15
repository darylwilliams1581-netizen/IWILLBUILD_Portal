/**
 * POST /api/dazza/anatomy/github/test-connection
 * Platform-owner only. Tests GitHub connection and returns repo/branch/SHA.
 * Never returns credentials or token values.
 */
import type { Request, Response } from 'express';
import { testGitHubConnection, ALLOWED_REPO } from '../../../../../lib/anatomy-github.js';

export default async function handler(req: Request, res: Response) {
  const branch = (req.body?.branch as string | undefined) ?? ALLOWED_REPO.defaultBranch;
  const result = await testGitHubConnection(branch);
  res.json(result);
}
