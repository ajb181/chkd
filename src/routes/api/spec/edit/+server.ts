import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { findItemByQuery, updateItem } from '$lib/server/db/items';

// POST /api/spec/edit - Edit an item's title, description, story, and metadata
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, title, description, story, keyRequirements, filesToChange, testing } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    const hasUpdate = title !== undefined || description !== undefined || story !== undefined ||
      keyRequirements !== undefined || filesToChange !== undefined || testing !== undefined;

    if (!hasUpdate) {
      return json({ success: false, error: 'At least one field required: title, description, story, keyRequirements, filesToChange, testing' }, { status: 400 });
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

    // Build update object with only provided fields
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (story !== undefined) updates.story = story;
    if (keyRequirements !== undefined) updates.keyRequirements = keyRequirements;
    if (filesToChange !== undefined) updates.filesToChange = filesToChange;
    if (testing !== undefined) updates.testing = testing;

    updateItem(dbItem.id, updates);

    return json({
      success: true,
      data: {
        itemId,
        message: `Updated: ${itemId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
