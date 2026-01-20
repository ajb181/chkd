import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { moveItem } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/spec/move - Move an item to a different area
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, targetAreaCode } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    if (!targetAreaCode) {
      return json({ success: false, error: 'targetAreaCode is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    await moveItem(specPath, itemId, targetAreaCode);

    return json({
      success: true,
      data: {
        itemId,
        targetAreaCode,
        message: `Moved ${itemId} to ${targetAreaCode}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
