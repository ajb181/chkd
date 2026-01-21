import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getRepoById, getSession } from '$lib/server/db/queries';
import { getDb } from '$lib/server/db';
import { markItemInProgress } from '$lib/server/spec/writer';
import { SpecParser } from '$lib/server/spec/parser';
import path from 'path';

// POST /api/session/working-on - Signal Claude is working on an item
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoId, repoPath, itemId, itemTitle } = body;

    let repo;
    if (repoId) {
      repo = getRepoById(repoId);
    } else if (repoPath) {
      repo = getRepoByPath(repoPath);
    }

    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Check if there's an active session
    const currentSession = getSession(repo.id);
    if (!currentSession?.currentTask) {
      return json({
        success: false,
        error: 'No active task',
        hint: 'Start a task first with: chkd start "TASK_ID"'
      }, { status: 400 });
    }

    // Resolve item by searching spec (itemId might be a title/query)
    let resolvedId = itemId;
    let resolvedTitle = itemTitle;

    if (itemId || itemTitle) {
      const specPath = path.join(repo.path, 'docs', 'SPEC.md');
      const parser = new SpecParser();
      const spec = await parser.parseFile(specPath);
      const queryLower = (itemId || itemTitle || '').toLowerCase();

      // Get current task to search its children first
      const session = getSession(repo.id);
      const currentTaskId = session?.currentTask?.id;

      // Helper to search children
      const searchChildren = (children: any[]): { id: string; title: string } | null => {
        for (const child of children) {
          if (child.status !== 'done' && child.title.toLowerCase().includes(queryLower)) {
            return { id: child.id, title: child.title };
          }
          if (child.children?.length > 0) {
            const found = searchChildren(child.children);
            if (found) return found;
          }
        }
        return null;
      };

      // Search current task's children first
      if (currentTaskId) {
        for (const area of spec.areas) {
          for (const item of area.items) {
            if (item.id === currentTaskId && item.children.length > 0) {
              const found = searchChildren(item.children);
              if (found) {
                resolvedId = found.id;
                resolvedTitle = found.title;
                break;
              }
            }
          }
          if (resolvedId !== itemId) break;
        }
      }

      // Fall back to global search
      if (resolvedId === itemId) {
        for (const area of spec.areas) {
          for (const item of area.items) {
            if (item.status !== 'done' && item.title.toLowerCase().includes(queryLower)) {
              resolvedId = item.id;
              resolvedTitle = item.title;
              break;
            }
            if (item.children?.length > 0) {
              const found = searchChildren(item.children);
              if (found) {
                resolvedId = found.id;
                resolvedTitle = found.title;
                break;
              }
            }
          }
          if (resolvedId !== itemId) break;
        }
      }
    }

    // Update session with current item
    const db = getDb();
    db.prepare(`
      UPDATE sessions SET
        current_item_id = ?,
        current_item_title = ?,
        current_item_start_time = datetime('now'),
        last_activity = datetime('now'),
        updated_at = datetime('now')
      WHERE repo_id = ?
    `).run(resolvedId || null, resolvedTitle || null, repo.id);

    // Mark item in-progress in spec file
    if (resolvedId) {
      const specPath = path.join(repo.path, 'docs', 'SPEC.md');
      try {
        await markItemInProgress(specPath, resolvedId);
      } catch (e) {
        // Item might already be in-progress or done, that's ok
      }
    }

    return json({
      success: true,
      data: {
        itemId: resolvedId,
        itemTitle: resolvedTitle,
        message: `Now working on: ${resolvedTitle || resolvedId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
