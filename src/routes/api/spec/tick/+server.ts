import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { markItemComplete } from '$lib/server/spec/writer';
import { clearQueue } from '$lib/server/proposal';
import path from 'path';

// POST /api/spec/tick - Mark an item complete
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery, itemId } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Find the item (including children)
    let targetId = itemId;
    let targetTitle = '';

    if (!targetId && itemQuery) {
      // Search by query - check both items and their children
      const sectionMatch = itemQuery.match(/^(\d+)\.(\d+)/);
      const queryLower = itemQuery.toLowerCase();

      // Helper to search children
      const searchChildren = (children: any[]): { id: string; title: string } | null => {
        for (const child of children) {
          if (child.title.toLowerCase().includes(queryLower)) {
            return { id: child.id, title: child.title };
          }
          if (child.children && child.children.length > 0) {
            const found = searchChildren(child.children);
            if (found) return found;
          }
        }
        return null;
      };

      for (const phase of spec.phases) {
        for (let i = 0; i < phase.items.length; i++) {
          const item = phase.items[i];

          // Check section match (e.g., "SD.1")
          if (sectionMatch) {
            const phaseNum = parseInt(sectionMatch[1]);
            const itemNum = parseInt(sectionMatch[2]);
            if (phase.number === phaseNum && (i + 1) === itemNum) {
              targetId = item.id;
              targetTitle = item.title;
              break;
            }
          }

          // Check item title
          if (item.title.toLowerCase().includes(queryLower)) {
            targetId = item.id;
            targetTitle = item.title;
            break;
          }

          // Search children recursively
          if (item.children && item.children.length > 0) {
            const found = searchChildren(item.children);
            if (found) {
              targetId = found.id;
              targetTitle = found.title;
              break;
            }
          }
        }
        if (targetId) break;
      }
    } else if (!targetId) {
      // No query - tick current task
      const repo = getRepoByPath(repoPath);
      if (repo) {
        const session = getSession(repo.id);
        if (session.currentTask) {
          targetId = session.currentTask.id;
          targetTitle = session.currentTask.title || '';
        }
      }
    }

    if (!targetId) {
      return json({
        success: false,
        error: 'No item specified and no current task'
      }, { status: 400 });
    }

    // Find title if not set (search children too)
    if (!targetTitle) {
      const findTitle = (items: any[]): string | null => {
        for (const item of items) {
          if (item.id === targetId) {
            return item.title;
          }
          if (item.children && item.children.length > 0) {
            const found = findTitle(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      for (const phase of spec.phases) {
        const found = findTitle(phase.items);
        if (found) {
          targetTitle = found;
          break;
        }
      }
    }

    await markItemComplete(specPath, targetId);

    // Get and clear queued items (user added while Claude was working)
    const queuedItems = clearQueue(repoPath);

    // Build response
    const response: Record<string, unknown> = {
      itemId: targetId,
      title: targetTitle,
      message: `Marked complete: ${targetTitle}`,
    };

    // If there are queued items, include them with instructions for Claude
    if (queuedItems.length > 0) {
      response.queuedItems = queuedItems.map(q => q.title);
      response.queuedCount = queuedItems.length;
      response.instruction = `USER QUEUED ${queuedItems.length} ITEM(S): ${queuedItems.map(q => `"${q.title}"`).join(', ')}. ADD these to your existing Claude Code TodoWrite list without losing any current items. Do NOT add to the spec.`;
    }

    return json({
      success: true,
      data: response
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
