import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getRepoByPath, getRepoById } from '$lib/server/db/queries';
import { getAllHandoverNotes } from '$lib/server/proposal';

// GET /api/session - Get current session state
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoId = url.searchParams.get('repoId');
    const repoPath = url.searchParams.get('repoPath');

    let repo;
    if (repoId) {
      repo = getRepoById(repoId);
    } else if (repoPath) {
      repo = getRepoByPath(repoPath);
    }

    if (!repo) {
      return json({
        success: true,
        data: {
          currentTask: null,
          startTime: null,
          iteration: 0,
          status: 'idle',
          mode: null,
          filesTouched: [],
          bugFixes: [],
          scopeChanges: [],
          deviations: [],
          elapsedMs: 0,
          lastActivity: null,
          message: 'No repository found'
        }
      });
    }

    const session = getSession(repo.id);
    const handoverNotes = await getAllHandoverNotes(repo.path);
    return json({
      success: true,
      data: { ...session, repoPath: repo.path, handoverNotes }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
