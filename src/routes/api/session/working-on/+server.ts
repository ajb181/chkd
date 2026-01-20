import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getRepoById } from '$lib/server/db/queries';
import { getDb } from '$lib/server/db';
import { markItemInProgress } from '$lib/server/spec/writer';
import path from 'path';

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

    // Update session with current item
    const db = getDb();
    db.prepare(`
      UPDATE sessions SET
        current_item_id = ?,
        current_item_title = ?,
        last_activity = datetime('now'),
        updated_at = datetime('now')
      WHERE repo_id = ?
    `).run(itemId || null, itemTitle || null, repo.id);

    // Mark item in-progress in spec file
    if (itemId) {
      const specPath = path.join(repo.path, 'docs', 'SPEC.md');
      try {
        await markItemInProgress(specPath, itemId);
      } catch (e) {
        // Item might already be in-progress or done, that's ok
      }
    }

    return json({
      success: true,
      data: {
        itemId,
        itemTitle,
        message: `Now working on: ${itemTitle || itemId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
