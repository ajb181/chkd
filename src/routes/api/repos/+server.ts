import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllRepos, createRepo, getRepoByPath } from '$lib/server/db/queries';
import fs from 'fs/promises';
import path from 'path';

// GET /api/repos - List all repositories
export const GET: RequestHandler = async () => {
  try {
    const repos = getAllRepos();
    return json({ success: true, data: repos });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/repos - Add a repository
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { path: repoPath, name, branch } = body;

    if (!repoPath) {
      return json({ success: false, error: 'path is required' }, { status: 400 });
    }

    // Check if already exists
    const existing = getRepoByPath(repoPath);
    if (existing) {
      return json({ success: false, error: 'Repository already added' }, { status: 400 });
    }

    // Check path exists and has .git
    try {
      await fs.access(path.join(repoPath, '.git'));
    } catch {
      return json({ success: false, error: 'Not a git repository' }, { status: 400 });
    }

    // Derive name from path if not provided
    const repoName = name || path.basename(repoPath);

    const repo = createRepo(repoPath, repoName, branch || 'main');
    return json({ success: true, data: repo });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
