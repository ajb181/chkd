import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { findItemByQuery, createItem, getChildren } from '$lib/server/db/items';

// POST /api/spec/add-child - Add a child item to an existing item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, parentId, title } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!parentId) {
      return json({ success: false, error: 'parentId is required' }, { status: 400 });
    }

    if (!title || !title.trim()) {
      return json({ success: false, error: 'title is required' }, { status: 400 });
    }

    // Write to DB (no fallback)
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    const parentItem = findItemByQuery(repo.id, parentId);
    if (!parentItem) {
      return json({ success: false, error: `Parent item "${parentId}" not found in database.` }, { status: 404 });
    }

    // Get existing children to determine sort order
    const siblings = getChildren(parentItem.id);
    const sortOrder = siblings.length;
    const childNumber = sortOrder + 1;
    const displayId = `${parentItem.displayId}.${childNumber}`;

    const newChild = createItem({
      repoId: repo.id,
      displayId,
      title: title.trim(),
      areaCode: parentItem.areaCode,
      sectionNumber: parentItem.sectionNumber,
      parentId: parentItem.id,
      sortOrder,
      status: 'open',
      priority: 'medium'
    });

    return json({
      success: true,
      data: {
        childId: newChild.id,
        parentId,
        title: title.trim(),
        message: `Added subtask: ${title.trim()}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
