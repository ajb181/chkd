import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { findItemByQuery, updateItem } from '$lib/server/db/items';
import type { ItemPriority } from '$lib/types';

// Convert numeric priority (1,2,3,null) to DB format (high,medium,low)
function numericToPriority(num: number | null): ItemPriority {
  switch (num) {
    case 1: return 'high';
    case 2: return 'medium';
    case 3: return 'low';
    default: return 'medium'; // null/backlog defaults to medium
  }
}

// POST /api/spec/priority - Set priority on an item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, priority } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    // Validate priority: must be 1, 2, 3, or null
    if (priority !== null && priority !== 1 && priority !== 2 && priority !== 3) {
      return json({ success: false, error: 'priority must be 1, 2, 3, or null' }, { status: 400 });
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

    updateItem(dbItem.id, { priority: numericToPriority(priority) });

    const priorityLabel = priority === null ? 'Backlog' : `P${priority}`;

    return json({
      success: true,
      data: {
        itemId,
        priority,
        message: `Set priority to ${priorityLabel}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
