import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, updateSession, setAnchor } from '$lib/server/db/queries';
import { findItemByQuery, getChildren, markItemInProgress as markItemInProgressDb } from '$lib/server/db/items';

// POST /api/spec/in-progress - Mark item as in-progress
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemQuery) {
      return json({ success: false, error: 'itemQuery is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    const session = getSession(repo.id);
    const currentTaskId = session?.currentTask?.id;
    const queryLower = itemQuery.toLowerCase();

    // Try to find item by query
    let dbItem = findItemByQuery(repo.id, itemQuery);

    // If not found and we have a current task, search its children
    if (!dbItem && currentTaskId) {
      const children = getChildren(currentTaskId);
      for (const child of children) {
        if (child.title.toLowerCase().includes(queryLower)) {
          dbItem = child;
          break;
        }
      }
    }

    if (!dbItem) {
      return json({ success: false, error: `Item "${itemQuery}" not found in database.` }, { status: 404 });
    }

    markItemInProgressDb(dbItem.id);

    const isParent = !dbItem.parentId;

    // Update session with current task info
    if (isParent) {
      // Top-level item: set as current task and anchor
      updateSession(repo.id, {
        currentTask: { id: dbItem.id, title: dbItem.title, phase: null },
        status: 'building'
      });
      setAnchor(repo.id, dbItem.id, dbItem.title, 'cli');
    } else {
      // Child item: just set current item (parent should already be set)
      updateSession(repo.id, {
        currentItem: { id: dbItem.id, title: dbItem.title }
      });
    }

    return json({
      success: true,
      data: {
        itemQuery,
        itemId: dbItem.id,
        itemTitle: dbItem.title,
        status: 'in-progress',
        message: `In progress: ${itemQuery}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
