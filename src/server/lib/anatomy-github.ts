/**
 * anatomy-github.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GitHub HTTPS API integration for Dazza Anatomy Index.
 *
 * SECURITY RULES (enforced here):
 *   - Only the allowlisted repository may be accessed.
 *   - Only the GITHUB_DAZZA_READ_TOKEN secret is used — never exposed.
 *   - No git CLI, no submodules, no LFS, no Actions artifacts.
 *   - No write operations of any kind.
 *   - Token never enters model context, logs, or browser responses.
 *   - Connection-test responses return repo name, branch, SHA — never credentials.
 */

import { getSecret } from '#airo/secrets';

// ── Allowlisted repository ────────────────────────────────────────────────────

export const ALLOWED_REPO = {
  owner:      'darylwilliams1581-netizen',
  repo:       'IWIllBUILD_Portal',
  defaultBranch: 'main',
} as const;

const GITHUB_API_BASE = 'https://api.github.com';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitHubConnectionResult {
  connected: boolean;
  repoFullName: string | null;
  branch: string | null;
  commitSha: string | null;
  commitDate: string | null;
  commitMessage: string | null;
  error: string | null;
  // Never include token, headers, or credentials
}

export interface GitHubFetchResult {
  commitSha: string;
  commitDate: string;
  commitMessage: string;
  archiveBuffer: Buffer;
  archiveSha256: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(): string {
  const token = getSecret('GITHUB_DAZZA_READ_TOKEN');
  if (!token) throw new Error('GITHUB_DAZZA_READ_TOKEN is not configured.');
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept':        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent':    'IWIllBUILD-Dazza-Anatomy/1.0',
  };
}

/** Verify the response is from the allowlisted repo */
function assertAllowlisted(repoFullName: string): void {
  const expected = `${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}`.toLowerCase();
  if (repoFullName.toLowerCase() !== expected) {
    throw new Error(`Repository ${repoFullName} is not in the allowlist.`);
  }
}

// ── Test connection ───────────────────────────────────────────────────────────

export async function testGitHubConnection(
  branch = ALLOWED_REPO.defaultBranch,
): Promise<GitHubConnectionResult> {
  try {
    const token = getToken();
    const headers = authHeaders(token);

    // 1. Verify repo access
    const repoRes = await fetch(
      `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );

    if (repoRes.status === 401) {
      return { connected: false, repoFullName: null, branch: null, commitSha: null, commitDate: null, commitMessage: null, error: 'Authentication failed — check GITHUB_DAZZA_READ_TOKEN.' };
    }
    if (repoRes.status === 404) {
      return { connected: false, repoFullName: null, branch: null, commitSha: null, commitDate: null, commitMessage: null, error: 'Repository not found or token lacks access.' };
    }
    if (!repoRes.ok) {
      return { connected: false, repoFullName: null, branch: null, commitSha: null, commitDate: null, commitMessage: null, error: `GitHub API error: ${repoRes.status}` };
    }

    const repoData = await repoRes.json() as { full_name: string; default_branch: string };
    assertAllowlisted(repoData.full_name);

    // 2. Resolve branch to SHA
    const branchRes = await fetch(
      `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/branches/${encodeURIComponent(branch)}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );

    if (!branchRes.ok) {
      return { connected: true, repoFullName: repoData.full_name, branch, commitSha: null, commitDate: null, commitMessage: null, error: `Branch '${branch}' not found.` };
    }

    const branchData = await branchRes.json() as {
      commit: { sha: string; commit: { author: { date: string }; message: string } }
    };

    return {
      connected:     true,
      repoFullName:  repoData.full_name,
      branch,
      commitSha:     branchData.commit.sha,
      commitDate:    branchData.commit.commit.author.date,
      commitMessage: branchData.commit.commit.message.split('\n')[0]?.slice(0, 200) ?? '',
      error:         null,
    };
  } catch (e) {
    const msg = String(e);
    // Never expose the token in error messages
    const safe = msg.replace(/ghp_[A-Za-z0-9]+/g, '[REDACTED]').replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED]');
    return { connected: false, repoFullName: null, branch: null, commitSha: null, commitDate: null, commitMessage: null, error: safe.slice(0, 300) };
  }
}

// ── Resolve ref to SHA ────────────────────────────────────────────────────────

export async function resolveRefToSha(ref: string): Promise<{
  sha: string;
  commitDate: string;
  commitMessage: string;
}> {
  const token = getToken();
  const headers = authHeaders(token);

  // Try as branch first
  const branchRes = await fetch(
    `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/branches/${encodeURIComponent(ref)}`,
    { headers, signal: AbortSignal.timeout(15_000) },
  );

  if (branchRes.ok) {
    const data = await branchRes.json() as {
      commit: { sha: string; commit: { author: { date: string }; message: string } }
    };
    return {
      sha:           data.commit.sha,
      commitDate:    data.commit.commit.author.date,
      commitMessage: data.commit.commit.message.split('\n')[0]?.slice(0, 200) ?? '',
    };
  }

  // Try as tag
  const tagRes = await fetch(
    `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/git/ref/tags/${encodeURIComponent(ref)}`,
    { headers, signal: AbortSignal.timeout(15_000) },
  );

  if (tagRes.ok) {
    const tagData = await tagRes.json() as { object: { sha: string; type: string } };
    let sha = tagData.object.sha;

    // Dereference annotated tags
    if (tagData.object.type === 'tag') {
      const tagObjRes = await fetch(
        `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/git/tags/${sha}`,
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      if (tagObjRes.ok) {
        const tagObj = await tagObjRes.json() as { object: { sha: string } };
        sha = tagObj.object.sha;
      }
    }

    // Get commit metadata
    const commitRes = await fetch(
      `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/commits/${sha}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (commitRes.ok) {
      const commitData = await commitRes.json() as { commit: { author: { date: string }; message: string } };
      return {
        sha,
        commitDate:    commitData.commit.author.date,
        commitMessage: commitData.commit.message.split('\n')[0]?.slice(0, 200) ?? '',
      };
    }
    return { sha, commitDate: '', commitMessage: '' };
  }

  // Try as commit SHA directly (must be 40 hex chars)
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    const commitRes = await fetch(
      `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/commits/${ref}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (commitRes.ok) {
      const commitData = await commitRes.json() as { commit: { author: { date: string }; message: string } };
      return {
        sha:           ref,
        commitDate:    commitData.commit.author.date,
        commitMessage: commitData.commit.message.split('\n')[0]?.slice(0, 200) ?? '',
      };
    }
  }

  throw new Error(`Could not resolve ref '${ref}' to a commit SHA.`);
}

// ── Download archive for exact SHA ───────────────────────────────────────────

export async function downloadArchiveForSha(sha: string): Promise<Buffer> {
  const token = getToken();
  const headers = authHeaders(token);

  // Use the tarball endpoint — GitHub redirects to a CDN URL
  const archiveUrl = `${GITHUB_API_BASE}/repos/${ALLOWED_REPO.owner}/${ALLOWED_REPO.repo}/zipball/${sha}`;

  const res = await fetch(archiveUrl, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),  // 2 min for large repos
  });

  if (!res.ok) {
    throw new Error(`Archive download failed: HTTP ${res.status}`);
  }

  // Verify content-type is a zip
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('zip') && !ct.includes('octet-stream') && !ct.includes('x-zip')) {
    // GitHub sometimes returns application/octet-stream — that's fine
    // Only reject if it's clearly HTML (error page)
    if (ct.includes('text/html')) {
      throw new Error(`Archive download returned HTML — possible auth error.`);
    }
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Check for new commits ─────────────────────────────────────────────────────

export async function checkForChanges(
  branch: string,
  knownSha: string,
): Promise<{ hasChanges: boolean; latestSha: string; commitDate: string; commitMessage: string }> {
  const result = await testGitHubConnection(branch);
  if (!result.commitSha) {
    throw new Error(result.error ?? 'Could not check for changes.');
  }
  return {
    hasChanges:    result.commitSha !== knownSha,
    latestSha:     result.commitSha,
    commitDate:    result.commitDate ?? '',
    commitMessage: result.commitMessage ?? '',
  };
}
