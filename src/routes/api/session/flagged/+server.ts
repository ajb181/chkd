import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getFlaggedItems,
  getPendingFlaggedItems,
  addFlaggedItem,
  generateId,
  type FlaggedItem,
} from '$lib/server/proposal';

// GET /api/session/flagged - Get flagged items for discussion
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const all = url.searchParams.get('all') === 'true';

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const items = all ? getFlaggedItems(repoPath) : getPendingFlaggedItems(repoPath);

    return json({
      success: true,
      data: {
        items,
        count: items.length,
        pending: getPendingFlaggedItems(repoPath).length,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/session/flagged - Capture something for later (user went off-plan)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, description, type, urgency } = body;

    if (!repoPath || !title) {
      return json({
        success: false,
        error: 'repoPath and title are required',
      }, { status: 400 });
    }

    const flaggedItem: FlaggedItem = {
      id: generateId(),
      repoPath,
      title,
      description: description || '',
      reason: 'User captured for later',
      urgency: urgency || 'low',
      type: type || 'idea',
      status: 'pending',
      createdAt: new Date(),
    };

    addFlaggedItem(flaggedItem);

    return json({
      success: true,
      data: {
        flaggedItemId: flaggedItem.id,
        message: `Captured "${title}" for later.`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
