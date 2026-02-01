import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getRepoByPath, getRepoById, updateSession, clearSession } from '$lib/server/db/queries';

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
    return json({
      success: true,
      data: { ...session, repoPath: repo.path }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// PATCH /api/session - Update session state manually
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, status, mode } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // If setting to idle, clear the session
    if (status === 'idle') {
      clearSession(repo.id);
      return json({
        success: true,
        data: { message: 'Session cleared', status: 'idle' }
      });
    }

    // Otherwise update status/mode
    const updates: { status?: string; mode?: string | null } = {};
    if (status) updates.status = status;
    if (mode !== undefined) updates.mode = mode;

    updateSession(repo.id, updates);

    return json({
      success: true,
      data: { message: `Session updated to ${status || mode}`, status, mode }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
