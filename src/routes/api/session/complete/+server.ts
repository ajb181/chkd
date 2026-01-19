import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, clearSession } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { markItemComplete } from '$lib/server/spec/writer';
import path from 'path';
import fs from 'fs/promises';

// POST /api/session/complete - Complete current task
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, markSpec = true } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not registered' }, { status: 404 });
    }

    const session = getSession(repo.id);
    if (!session.currentTask) {
      return json({ success: false, error: 'No active task to complete' }, { status: 400 });
    }

    const completedTask = session.currentTask.title;
    const completedId = session.currentTask.id;

    // Mark the item complete in the spec file
    if (markSpec) {
      const specPath = path.join(repoPath, 'docs', 'SPEC.md');
      try {
        await markItemComplete(specPath, completedId);
      } catch (err) {
        // Log but don't fail - session still completes
        console.error('Failed to mark spec item complete:', err);
      }
    }

    // Clear the session
    clearSession(repo.id);

    // Find next task
    let nextTask: string | null = null;
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    try {
      await fs.access(specPath);
      const parser = new SpecParser();
      const spec = await parser.parseFile(specPath);
      const incomplete = parser.getIncompleteItems(spec);
      if (incomplete.length > 0) {
        nextTask = incomplete[0].title;
      }
    } catch {
      // No spec or can't parse
    }

    return json({
      success: true,
      data: {
        completedTask,
        completedId,
        nextTask,
        message: nextTask ? `Completed! Next up: ${nextTask}` : 'All done! 🎉'
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
