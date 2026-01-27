import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, clearSession } from '$lib/server/db/queries';
import { getItem, getChildren, markItemDone } from '$lib/server/db/items';

// POST /api/session/complete - Complete current task
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, markSpec = true, force = false } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not registered' }, { status: 404 });
    }

    const session = getSession(repo.id);
    if (!session.currentTask) {
      return json({ success: false, error: 'No active task to complete' }, { status: 400 });
    }

    const completedTask = session.currentTask.title;
    const completedId = session.currentTask.id;

    // Check for incomplete children before marking complete
    if (markSpec && !force && completedId) {
      const children = getChildren(completedId);
      const incompleteChildren = children.filter(c => c.status !== 'done');

      if (incompleteChildren.length > 0) {
        return json({
          success: false,
          error: `Task has ${incompleteChildren.length} incomplete sub-item(s)`,
          incompleteItems: incompleteChildren.map(c => c.title),
          hint: 'Complete all sub-items first, or use --force to override'
        }, { status: 400 });
      }
    }

    // Mark the item complete in DB
    if (markSpec && completedId) {
      markItemDone(completedId);
    }

    // Clear the session
    // Check if user set an anchor before clearing session
    const userAnchor = session.anchor;

    clearSession(repo.id);

    // Determine next task message
    let nextTask: string | null = null;
    let message: string;

    if (userAnchor) {
      // User explicitly set what's next
      nextTask = userAnchor.title;
      message = `Completed! Next up: ${nextTask}`;
    } else {
      // No user anchor - prompt discussion instead of auto-suggesting
      message = 'Completed! Discuss with user what to work on next.';
    }

    return json({
      success: true,
      data: {
        completedTask,
        completedId,
        nextTask,
        message
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
