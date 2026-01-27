import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { findItemByQuery, deleteItem } from '$lib/server/db/items';

// POST /api/spec/delete - Delete an item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    // Write to DB (no fallback)
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    const dbItem = findItemByQuery(repo.id, itemId);
    if (!dbItem) {
      return json({ success: false, error: `Item "${itemId}" not found in database.` }, { status: 404 });
    }

    deleteItem(dbItem.id);

    return json({
      success: true,
      data: {
        itemId,
        message: `Deleted: ${itemId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
