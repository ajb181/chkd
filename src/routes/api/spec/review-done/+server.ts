import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { getItem, markReviewCompleted } from '$lib/server/db/items';
import fs from 'fs';
import path from 'path';

// POST /api/spec/review-done - Mark item as review completed
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, summary } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    if (!summary || summary.trim().length < 10) {
      return json({ success: false, error: 'Summary must be at least 10 characters' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Get the item
    const item = getItem(itemId);
    if (!item) {
      return json({ success: false, error: `Item not found: ${itemId}` }, { status: 404 });
    }

    // Mark review completed in DB
    markReviewCompleted(itemId);

    // Also save to review.log for audit trail
    const chkdDir = path.join(repoPath, '.chkd');
    if (!fs.existsSync(chkdDir)) {
      fs.mkdirSync(chkdDir, { recursive: true });
    }

    const logEntry = {
      itemId: item.displayId,
      timestamp: new Date().toISOString(),
      summary: summary.trim()
    };

    const logPath = path.join(chkdDir, 'review.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

    return json({
      success: true,
      data: {
        itemId: item.displayId,
        reviewCompleted: true
      }
    });
  } catch (error) {
    console.error('Error in review-done:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
