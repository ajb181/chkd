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
    const { repoPath, markSpec = true, force = false } = body;

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

    // Check for incomplete children before marking complete
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    if (markSpec && !force) {
      try {
        const parser = new SpecParser();
        const spec = await parser.parseFile(specPath);

        // Find the current task in the spec
        let currentItem = null;
        for (const area of spec.areas) {
          for (const item of area.items) {
            if (item.id === completedId || item.title.includes(completedTask)) {
              currentItem = item;
              break;
            }
          }
          if (currentItem) break;
        }

        // Check for incomplete children
        if (currentItem && currentItem.children && currentItem.children.length > 0) {
          const incompleteChildren = currentItem.children.filter((c: any) => !c.completed);
          if (incompleteChildren.length > 0) {
            return json({
              success: false,
              error: `Task has ${incompleteChildren.length} incomplete sub-item(s)`,
              incompleteItems: incompleteChildren.map((c: any) => c.title),
              hint: 'Complete all sub-items first, or use --force to override'
            }, { status: 400 });
          }
        }
      } catch (err) {
        // Can't check - proceed anyway
        console.error('Could not check for incomplete children:', err);
      }
    }

    // Mark the item complete in the spec file
    if (markSpec) {
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
