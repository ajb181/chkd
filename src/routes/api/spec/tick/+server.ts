import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, saveItemDuration, updateSession } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { markItemComplete } from '$lib/server/spec/writer';
import { clearQueue } from '$lib/server/proposal';
import path from 'path';

// POST /api/spec/tick - Mark an item complete
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery, itemId, confirmFeedback } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Find the item (including children)
    let targetId = itemId;
    let targetTitle = '';

    // Helper to search children (only incomplete items)
    const searchChildren = (children: any[], queryLower: string): { id: string; title: string } | null => {
      for (const child of children) {
        // Only match incomplete items
        if (child.status !== 'done' && child.title.toLowerCase().includes(queryLower)) {
          return { id: child.id, title: child.title };
        }
        if (child.children && child.children.length > 0) {
          const found = searchChildren(child.children, queryLower);
          if (found) return found;
        }
      }
      return null;
    };

    // Get current session to prioritize current task's children
    const repo = getRepoByPath(repoPath);
    const session = repo ? getSession(repo.id) : null;
    const currentTaskId = session?.currentTask?.id;

    if (!targetId && itemQuery) {
      const areaMatch = itemQuery.match(/^([A-Z]{2,3})\.(\d+)/i);
      const numericMatch = itemQuery.match(/^(\d+)\.(\d+)/);
      const queryLower = itemQuery.toLowerCase();

      // FIRST: If we have a current task, search its children first
      if (currentTaskId) {
        for (const area of spec.areas) {
          for (const item of area.items) {
            if (item.id === currentTaskId && item.children.length > 0) {
              const found = searchChildren(item.children, queryLower);
              if (found) {
                targetId = found.id;
                targetTitle = found.title;
                break;
              }
            }
          }
          if (targetId) break;
        }
      }

      // SECOND: Search all areas if not found in current task
      if (!targetId) {
        for (const area of spec.areas) {
          for (let i = 0; i < area.items.length; i++) {
            const item = area.items[i];

            // Check area code match (e.g., "SD.1", "FE.2")
            if (areaMatch) {
              const areaCode = areaMatch[1].toUpperCase();
              const itemNum = parseInt(areaMatch[2]);
              if (area.code === areaCode && (i + 1) === itemNum) {
                targetId = item.id;
                targetTitle = item.title;
                break;
              }
            }

            // Check numeric match for backward compat (e.g., "1.1")
            if (numericMatch) {
              const phaseIdx = parseInt(numericMatch[1]);
              const itemNum = parseInt(numericMatch[2]);
              const areaIdx = spec.areas.indexOf(area) + 1;
              if (areaIdx === phaseIdx && (i + 1) === itemNum) {
                targetId = item.id;
                targetTitle = item.title;
                break;
              }
            }

            // Check item title (only incomplete)
            if (item.status !== 'done' && item.title.toLowerCase().includes(queryLower)) {
              targetId = item.id;
              targetTitle = item.title;
              break;
            }

            // Search children recursively
            if (item.children && item.children.length > 0) {
              const found = searchChildren(item.children, queryLower);
              if (found) {
                targetId = found.id;
                targetTitle = found.title;
                break;
              }
            }
          }
          if (targetId) break;
        }
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

    // Find title, parent info, and sibling info
    let parentTitle = '';
    let parentId = '';
    let hasMoreSiblings = false;

    const findItemWithContext = (items: any[], parent?: any): { title: string; parentTitle?: string; parentId?: string; hasMoreSiblings: boolean } | null => {
      for (const item of items) {
        if (item.id === targetId) {
          // Check if there are incomplete siblings
          const siblings = parent?.children || items;
          const incompleteSiblings = siblings.filter((s: any) => s.id !== targetId && s.status !== 'done');
          return {
            title: item.title,
            parentTitle: parent?.title,
            parentId: parent?.id,
            hasMoreSiblings: incompleteSiblings.length > 0
          };
        }
        if (item.children && item.children.length > 0) {
          const found = findItemWithContext(item.children, item);
          if (found) return found;
        }
      }
      return null;
    };

    for (const area of spec.areas) {
      const found = findItemWithContext(area.items);
      if (found) {
        if (!targetTitle) targetTitle = found.title;
        parentTitle = found.parentTitle || '';
        parentId = found.parentId || '';
        hasMoreSiblings = found.hasMoreSiblings;
        break;
      }
    }

    await markItemComplete(specPath, targetId);

    // Save item duration if we were tracking this item
    if (repo && session?.currentItem?.startTime) {
      const startTime = new Date(session.currentItem.startTime + 'Z').getTime();
      const durationMs = Date.now() - startTime;
      if (durationMs > 0) {
        saveItemDuration(repo.id, targetId, durationMs);
      }
      // Clear current item
      updateSession(repo.id, { currentItem: null });
    }

    // Get and clear queued items (user added while Claude was working)
    const queuedItems = clearQueue(repoPath);

    // Check for rapid ticks (rate limiting)
    const lastTickKey = `lastTick:${repo?.id}`;
    const now = Date.now();
    const lastTick = (global as any)[lastTickKey] || 0;
    const timeSinceLastTick = now - lastTick;
    const isRapidTick = timeSinceLastTick < 5000; // Less than 5 seconds
    (global as any)[lastTickKey] = now;

    // Build response
    const shortTitle = targetTitle.length > 40 ? targetTitle.slice(0, 40) + '...' : targetTitle;

    const response: Record<string, unknown> = {
      itemId: targetId,
      title: targetTitle,
      parentTitle: parentTitle || null,
      message: `✓ ${shortTitle}`,
    };

    // Warn on rapid ticks
    if (isRapidTick) {
      response.rapidTick = true;
      response.warning = 'Rapid ticking detected - tick items as you complete them, not in batches!';
    }

    // If there are queued items, include them with instructions for Claude
    if (queuedItems.length > 0) {
      response.queuedItems = queuedItems.map(q => q.title);
      response.queuedCount = queuedItems.length;
      response.instruction = `USER QUEUED ${queuedItems.length} ITEM(S): ${queuedItems.map(q => `"${q.title}"`).join(', ')}. ADD these to your existing Claude Code TodoWrite list without losing any current items. Do NOT add to the spec.`;
    }

    // Smart next-step based on context
    if (parentTitle) {
      // This is a sub-task
      if (hasMoreSiblings) {
        response.nextStep = 'Continue to next sub-task.';
      } else {
        // Last sub-task - remind to close the main task
        const shortParent = parentTitle.length > 30 ? parentTitle.slice(0, 30) + '...' : parentTitle;
        response.nextStep = `Sub-tasks done. Close task: chkd tick "${shortParent}"`;
      }
    } else {
      // This is a main task - warn about going idle
      response.nextStep = 'Feature complete. You are now idle. Use chkd start for next task.';
    }

    return json({
      success: true,
      data: response
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
