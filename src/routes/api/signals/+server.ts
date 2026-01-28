/**
 * Signals API - Manager signals for multi-worker coordination
 *
 * GET /api/signals?repoPath=...&activeOnly=true - List signals
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getActiveSignals } from '$lib/server/db/queries';

export const GET: RequestHandler = async ({ url }) => {
  const repoPath = url.searchParams.get('repoPath');
  const activeOnly = url.searchParams.get('activeOnly') === 'true';

  if (!repoPath) {
    return json({ success: false, error: 'repoPath is required' }, { status: 400 });
  }

  const repo = getRepoByPath(repoPath);
  if (!repo) {
    return json({ success: false, error: 'Repository not found' }, { status: 404 });
  }

  const signals = getActiveSignals(repo.id, activeOnly);

  return json({ success: true, data: signals });
};
