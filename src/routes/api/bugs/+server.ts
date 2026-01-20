import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getBugs, createBug, createRepo, updateBugStatus, getBugByQuery } from '$lib/server/db/queries';
import path from 'path';

// GET /api/bugs - List bugs for a repo
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: true, data: [] });
    }

    const bugs = getBugs(repo.id);
    return json({ success: true, data: bugs });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/bugs - Create a bug
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, description, severity = 'medium' } = body;

    if (!repoPath || !title) {
      return json({ success: false, error: 'repoPath and title are required' }, { status: 400 });
    }

    // Find or create repo
    let repo = getRepoByPath(repoPath);
    if (!repo) {
      const repoName = path.basename(repoPath);
      repo = createRepo(repoPath, repoName);
    }

    const bug = createBug(repo.id, title, description, severity);

    return json({
      success: true,
      data: {
        id: bug.id,
        title: bug.title,
        severity: bug.severity,
        message: `Bug logged: ${title}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// PATCH /api/bugs - Update bug status (fix, close, reopen)
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, bugQuery, status } = body;

    if (!repoPath || !bugQuery) {
      return json({ success: false, error: 'repoPath and bugQuery are required' }, { status: 400 });
    }

    const validStatuses = ['open', 'in_progress', 'fixed', 'wont_fix'];
    if (status && !validStatuses.includes(status)) {
      return json({ success: false, error: `Invalid status. Use: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Find bug by query (ID prefix or title)
    const bug = getBugByQuery(repo.id, bugQuery);
    if (!bug) {
      return json({ success: false, error: `Bug not found: ${bugQuery}` }, { status: 404 });
    }

    const newStatus = status || 'fixed';
    const updated = updateBugStatus(bug.id, newStatus);

    if (!updated) {
      return json({ success: false, error: 'Failed to update bug' }, { status: 500 });
    }

    return json({
      success: true,
      data: {
        id: bug.id,
        title: bug.title,
        status: newStatus,
        message: `Bug ${newStatus}: ${bug.title}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
