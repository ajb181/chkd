import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getBugs, createBug, createRepo } from '$lib/server/db/queries';
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
