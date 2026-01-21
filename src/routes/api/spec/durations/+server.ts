import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getItemDurations } from '$lib/server/db/queries';

// GET /api/spec/durations - Get time spent on each item
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: true, data: {} });
    }

    const durations = getItemDurations(repo.id);
    return json({ success: true, data: durations });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
