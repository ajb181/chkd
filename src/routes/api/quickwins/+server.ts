import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import {
  getQuickWins,
  createQuickWin,
  completeQuickWin,
  deleteQuickWin,
  getQuickWinByQuery,
  updateQuickWin
} from '$lib/server/quickwins';

// GET /api/quickwins - List quick wins for a repo (from markdown file)
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    const repoId = repo?.id || 'unknown';

    const wins = getQuickWins(repoPath, repoId);
    return json({ success: true, data: wins });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/quickwins - Create a quick win (adds to markdown file)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title } = body;

    if (!repoPath || !title) {
      return json({ success: false, error: 'repoPath and title are required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    const repoId = repo?.id || 'unknown';

    const win = createQuickWin(repoPath, repoId, title);

    return json({
      success: true,
      data: {
        id: win.id,
        title: win.title,
        message: `Quick win added: ${title}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// PATCH /api/quickwins - Complete a quick win (toggles checkbox in markdown)
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, query } = body;

    if (!repoPath || !query) {
      return json({ success: false, error: 'repoPath and query are required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    const repoId = repo?.id || 'unknown';

    const win = getQuickWinByQuery(repoPath, repoId, query);
    if (!win) {
      return json({ success: false, error: `Quick win not found: ${query}` }, { status: 404 });
    }

    const completed = completeQuickWin(repoPath, win.id);
    if (!completed) {
      return json({ success: false, error: 'Failed to complete quick win' }, { status: 500 });
    }

    return json({
      success: true,
      data: {
        id: win.id,
        title: win.title,
        status: win.status === 'open' ? 'done' : 'open',  // toggled
        message: `Quick win ${win.status === 'open' ? 'done' : 'reopened'}: ${win.title}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// PUT /api/quickwins - Update a quick win's title
export const PUT: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, id, title } = body;

    if (!repoPath || !id || !title) {
      return json({ success: false, error: 'repoPath, id, and title are required' }, { status: 400 });
    }

    const result = updateQuickWin(repoPath, id, title.trim());

    if (!result.success) {
      return json({ success: false, error: 'Quick win not found' }, { status: 404 });
    }

    return json({
      success: true,
      data: {
        id: result.newId,
        title: title.trim(),
        message: 'Quick win updated'
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// DELETE /api/quickwins - Delete a quick win (removes line from markdown)
export const DELETE: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const id = url.searchParams.get('id');

    if (!repoPath || !id) {
      return json({ success: false, error: 'repoPath and id are required' }, { status: 400 });
    }

    const deleted = deleteQuickWin(repoPath, id);
    if (!deleted) {
      return json({ success: false, error: 'Quick win not found' }, { status: 404 });
    }

    return json({ success: true, data: { message: 'Quick win deleted' } });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
