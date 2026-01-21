import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, clearSession } from '$lib/server/db/queries';
import { setHandoverNote, getHandoverNote, getAllHandoverNotes } from '$lib/server/proposal';

// GET /api/session/pause - Get handover notes for a repo
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const taskId = url.searchParams.get('taskId');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    // If taskId provided, get specific note
    if (taskId) {
      const note = await getHandoverNote(repoPath, taskId);
      return json({
        success: true,
        data: note || null,
      });
    }

    // Otherwise return all notes
    const notes = await getAllHandoverNotes(repoPath);
    return json({
      success: true,
      data: notes,
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/session/pause - Pause current task with optional handover note
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, note, pausedBy = 'user' } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not registered' }, { status: 404 });
    }

    const session = getSession(repo.id);
    if (!session.currentTask) {
      return json({ success: false, error: 'No active task to pause' }, { status: 400 });
    }

    const pausedTask = session.currentTask.title;
    const pausedId = session.currentTask.id;

    // Save handover note if provided
    let handover = null;
    if (note && note.trim()) {
      handover = await setHandoverNote(repoPath, pausedId, pausedTask, note.trim(), pausedBy);
    }

    // Clear the session (task goes back to queue)
    clearSession(repo.id);

    return json({
      success: true,
      data: {
        pausedTask,
        pausedId,
        handoverNote: handover,
        message: note
          ? `Paused "${pausedTask}" with handover note`
          : `Paused "${pausedTask}" - returned to queue`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
