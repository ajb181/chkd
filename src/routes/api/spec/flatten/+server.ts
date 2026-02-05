import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { flattenHierarchy } from '$lib/server/db/items';

// POST /api/spec/flatten - Flatten 3-level hierarchy to 2-level
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, all } = body;

    if (!repoPath && !all) {
      return json({
        success: false,
        error: 'Either repoPath or all=true required',
        hint: 'Use repoPath to flatten one repo, or all=true for all repos'
      }, { status: 400 });
    }

    let repoId: string | undefined;

    if (repoPath) {
      const repo = getRepoByPath(repoPath);
      if (!repo) {
        return json({ success: false, error: 'Repository not found' }, { status: 404 });
      }
      repoId = repo.id;
    }

    const result = flattenHierarchy(repoId);

    return json({
      success: true,
      data: {
        reparented: result.reparented,
        deleted: result.deleted,
        message: `Flattened hierarchy: ${result.reparented} items reparented, ${result.deleted} middle-gen items deleted`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
