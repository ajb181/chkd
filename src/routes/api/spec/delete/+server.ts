import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteItem } from '$lib/server/spec/writer';
import path from 'path';

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

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    await deleteItem(specPath, itemId);

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
