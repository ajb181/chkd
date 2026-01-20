import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuditItems } from '$lib/server/proposal';

// GET /api/session/audit - Get audit items (small changes awaiting review)
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const items = getAuditItems(repoPath);
    const unreviewed = items.filter(i => !i.reviewed);
    const untested = items.filter(i => !i.tested);

    return json({
      success: true,
      data: {
        items,
        count: items.length,
        unreviewed: unreviewed.length,
        untested: untested.length,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/session/audit - Mark an audit item as tested/reviewed
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, action } = body;

    if (!repoPath || !itemId || !action) {
      return json({
        success: false,
        error: 'repoPath, itemId, and action are required',
      }, { status: 400 });
    }

    if (!['mark-tested', 'mark-reviewed'].includes(action)) {
      return json({
        success: false,
        error: 'action must be: mark-tested or mark-reviewed',
      }, { status: 400 });
    }

    const items = getAuditItems(repoPath);
    const item = items.find(i => i.id === itemId);

    if (!item) {
      return json({ success: false, error: 'Audit item not found' }, { status: 404 });
    }

    if (action === 'mark-tested') {
      item.tested = true;
    } else if (action === 'mark-reviewed') {
      item.reviewed = true;
    }

    return json({
      success: true,
      data: {
        item,
        message: `Marked as ${action.replace('mark-', '')}`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
