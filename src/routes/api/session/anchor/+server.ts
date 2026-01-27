import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, setAnchor, clearAnchor, getSession, isOnTrack } from '$lib/server/db/queries';
import { checkItemTbc } from '$lib/server/db/items';

// GET /api/session/anchor - Get current anchor status
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    const session = getSession(repo.id);
    const trackStatus = isOnTrack(repo.id);

    return json({
      success: true,
      data: {
        anchor: session.anchor,
        currentTask: session.currentTask,
        onTrack: trackStatus.onTrack,
        status: session.status,
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/session/anchor - Set anchor from UI
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, taskId, taskTitle, setBy = 'ui', skipTbcCheck = false } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!taskId || !taskTitle) {
      return json({
        success: false,
        error: 'taskId and taskTitle are required',
        hint: 'Click a spec item to set it as the anchor'
      }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Check for TBC fields before allowing work to start
    if (!skipTbcCheck) {
      const tbcResult = checkItemTbc(repo.id, taskId);

      if (tbcResult.hasTbc) {
        return json({
          success: false,
          error: `Cannot start work - fill in TBC fields first`,
          hint: `Run: chkd edit "${taskId}" --${tbcResult.tbcFields[0].toLowerCase().replace(/ /g, '')} "..."`,
          tbcFields: tbcResult.tbcFields,
          requiresEdit: true
        }, { status: 400 });
      }
    }

    setAnchor(repo.id, taskId, taskTitle, setBy);

    const trackStatus = isOnTrack(repo.id);

    return json({
      success: true,
      data: {
        anchor: { id: taskId, title: taskTitle, setBy },
        onTrack: trackStatus.onTrack,
        message: `🎯 Anchor set: ${taskTitle}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// DELETE /api/session/anchor - Clear anchor
export const DELETE: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    clearAnchor(repo.id);

    return json({
      success: true,
      data: {
        message: 'Anchor cleared'
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
