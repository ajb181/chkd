import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { editItem } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/spec/edit - Edit an item's title and/or description
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, title, description } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    if (title === undefined && description === undefined) {
      return json({ success: false, error: 'title or description required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    await editItem(specPath, itemId, title, description);

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
