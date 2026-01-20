import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { skipItem, unskipItem } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/spec/skip - Skip or unskip an item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, skip = true } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    if (skip) {
      await skipItem(specPath, itemId);
    } else {
      await unskipItem(specPath, itemId);
    }

    return json({
      success: true,
      data: {
        itemId,
        skipped: skip,
        message: skip ? `Skipped: ${itemId}` : `Unskipped: ${itemId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
