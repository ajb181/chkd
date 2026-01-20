import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getQueueItems,
  addQueueItem,
  removeQueueItem,
  type QueueItem,
} from '$lib/server/proposal';

// GET /api/session/queue - Get queued items
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const items = getQueueItems(repoPath);

    return json({
      success: true,
      data: {
        items,
        count: items.length,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/session/queue - Add item to queue
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title } = body;

    if (!repoPath || !title) {
      return json({
        success: false,
        error: 'repoPath and title are required',
      }, { status: 400 });
    }

    const item = addQueueItem(repoPath, title);

    return json({
      success: true,
      data: {
        item,
        message: `Queued: "${title}"`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// DELETE /api/session/queue - Remove item from queue
export const DELETE: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const itemId = url.searchParams.get('id');

    if (!repoPath || !itemId) {
      return json({
        success: false,
        error: 'repoPath and id are required',
      }, { status: 400 });
    }

    const removed = removeQueueItem(repoPath, itemId);

    if (!removed) {
      return json({
        success: false,
        error: 'Item not found',
      }, { status: 404 });
    }

    return json({
      success: true,
      data: {
        message: 'Item removed from queue',
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
