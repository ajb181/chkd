import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getRepoById, getSession } from '$lib/server/db/queries';
import { getDb } from '$lib/server/db';
import { findItemByQuery, getChildren, markItemInProgress } from '$lib/server/db/items';

// POST /api/session/working-on - Signal Claude is working on an item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoId, repoPath, itemId, itemTitle } = body;

    let repo;
    if (repoId) {
      repo = getRepoById(repoId);
    } else if (repoPath) {
      repo = getRepoByPath(repoPath);
    }

    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Check if there's an active session
    const currentSession = getSession(repo.id);
    if (!currentSession?.currentTask) {
      return json({
        success: false,
        error: 'No active task',
        hint: 'Start a task first with: chkd start "TASK_ID"'
      }, { status: 400 });
    }

    // Resolve item by searching DB
    let resolvedId = itemId;
    let resolvedTitle = itemTitle;
    const queryLower = (itemId || itemTitle || '').toLowerCase();

    if (itemId || itemTitle) {
      // Get current task to search its children first
      const currentTaskId = currentSession.currentTask?.id;

      // Search current task's children first
      if (currentTaskId) {
        const children = getChildren(currentTaskId);
        for (const child of children) {
          if (child.status !== 'done' && child.title.toLowerCase().includes(queryLower)) {
            resolvedId = child.id;
            resolvedTitle = child.title;
            break;
          }
        }
      }

      // Fall back to global search if not found in children
      if (resolvedId === itemId) {
        const dbItem = findItemByQuery(repo.id, itemId || itemTitle);
        if (dbItem) {
          resolvedId = dbItem.id;
          resolvedTitle = dbItem.title;
        }
      }
    }

    // Update session with current item
    const db = getDb();
    db.prepare(`
      UPDATE sessions SET
        current_item_id = ?,
        current_item_title = ?,
        current_item_start_time = datetime('now'),
        last_activity = datetime('now'),
        updated_at = datetime('now')
      WHERE repo_id = ?
    `).run(resolvedId || null, resolvedTitle || null, repo.id);

    // Mark item in-progress in DB
    if (resolvedId) {
      try {
        markItemInProgress(resolvedId);
      } catch (e) {
        // Item might already be in-progress or done, that's ok
      }
    }

    // Check if this is a Feedback item - needs user approval before ticking
    const isFeedback = (resolvedTitle || '').toLowerCase().includes('feedback');

    const response: Record<string, unknown> = {
      itemId: resolvedId,
      itemTitle: resolvedTitle,
      message: `Now working on: ${resolvedTitle || resolvedId}`
    };

    if (isFeedback) {
      response.warning = 'Get user approval before ticking. Use TodoWrite to stay on task.';
    }

    return json({ success: true, data: response });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
