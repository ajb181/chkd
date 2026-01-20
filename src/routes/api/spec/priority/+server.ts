import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPriority } from '$lib/server/spec/writer';
import path from 'path';

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

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    await setPriority(specPath, itemId, priority);

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
