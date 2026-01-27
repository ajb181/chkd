import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { findItemByQuery, setItemTags } from '$lib/server/db/items';

// POST /api/spec/tags - Set tags on an item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, tags } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    if (!Array.isArray(tags)) {
      return json({ success: false, error: 'tags must be an array' }, { status: 400 });
    }

    // Validate each tag: lowercase alphanumeric + hyphen/underscore
    const tagRegex = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/;
    for (const tag of tags) {
      if (typeof tag !== 'string' || !tagRegex.test(tag)) {
        return json({
          success: false,
          error: `Invalid tag "${tag}". Tags must be lowercase alphanumeric with optional hyphens/underscores.`
        }, { status: 400 });
      }
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

    setItemTags(dbItem.id, tags);

    return json({
      success: true,
      data: {
        itemId,
        tags,
        message: `Set ${tags.length} tag(s): ${tags.join(', ')}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
