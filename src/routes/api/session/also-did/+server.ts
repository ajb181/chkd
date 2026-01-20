import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, addAlsoDid, getSession } from '$lib/server/db/queries';

// POST /api/session/also-did - Log off-plan work
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, description } = body;

    if (!repoPath || !description) {
      return json({
        success: false,
        error: 'repoPath and description are required',
      }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({
        success: false,
        error: 'Repository not found',
      }, { status: 404 });
    }

    const session = getSession(repo.id);
    if (!session.currentTask) {
      return json({
        success: false,
        error: 'No active task',
      }, { status: 400 });
    }

    addAlsoDid(repo.id, description);

    return json({
      success: true,
      data: {
        added: description,
        message: `Logged: "${description}"`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
