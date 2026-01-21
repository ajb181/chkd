import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, clearSession } from '$lib/server/db/queries';

// POST /api/session/idle - Force session to idle state
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not registered' }, { status: 404 });
    }

    // Clear the session - force to idle
    clearSession(repo.id);

    return json({
      success: true,
      data: {
        message: 'Session returned to idle',
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
