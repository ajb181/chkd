import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { checkItemTbc } from '$lib/server/db/items';

// GET /api/spec/check-tbc - Check if item has TBC fields
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const item = url.searchParams.get('item');

    if (!repoPath || !item) {
      return json({ success: false, error: 'repoPath and item are required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    const result = checkItemTbc(repo.id, item);

    return json({
      success: true,
      data: result
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
