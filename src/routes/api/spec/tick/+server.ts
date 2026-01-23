import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, saveItemDuration, updateSession, clearSession } from '$lib/server/db/queries';
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
      const areaMatch = itemQuery.match(/^([A-Z]{2,3})\.(\d+)$/i);
      const numericMatch = itemQuery.match(/^(\d+)\.(\d+)$/);
      const queryLower = itemQuery.toLowerCase();

      // FIRST: If query is an area code (BE.2, SD.1), match by area code ONLY
      if (areaMatch) {
        const areaCode = areaMatch[1].toUpperCase();
        const itemNum = parseInt(areaMatch[2]);
        for (const area of spec.areas) {
          if (area.code === areaCode) {
            const item = area.items[itemNum - 1];
            if (item) {
              targetId = item.id;
              targetTitle = item.title;
            }
            break;
          }
        }
      }

      // SECOND: If query is numeric (1.1), match by area index
      if (!targetId && numericMatch) {
        const areaIdx = parseInt(numericMatch[1]);
        const itemNum = parseInt(numericMatch[2]);
        const area = spec.areas[areaIdx - 1];
        if (area) {
          const item = area.items[itemNum - 1];
          if (item) {
            targetId = item.id;
            targetTitle = item.title;
          }
        }
      }

      // THIRD: Search current task's children by title
      if (!targetId && currentTaskId) {
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

      // FOURTH: Search all items by title
      if (!targetId) {
        for (const area of spec.areas) {
          for (const item of area.items) {
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

    // Helper to find incomplete children
    const findIncompleteChildren = (items: any[], targetId: string): string[] => {
      for (const item of items) {
        if (item.id === targetId) {
          if (!item.children || item.children.length === 0) return [];
          const incomplete: string[] = [];
          const collectIncomplete = (children: any[]) => {
            for (const child of children) {
              if (child.status !== 'done') {
                incomplete.push(child.title);
              }
              if (child.children) collectIncomplete(child.children);
            }
          };
          collectIncomplete(item.children);
          return incomplete;
        }
        if (item.children) {
          const found = findIncompleteChildren(item.children, targetId);
          if (found.length > 0 || item.children.some((c: any) => c.id === targetId)) {
            return found;
          }
        }
      }
      return [];
    };

    // Helper to find item status
    const findItemStatus = (items: any[], targetId: string): string | null => {
      for (const item of items) {
        if (item.id === targetId) return item.status;
        if (item.children) {
          const found = findItemStatus(item.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };

    // Check if item is already complete
    let itemStatus: string | null = null;
    for (const area of spec.areas) {
      itemStatus = findItemStatus(area.items, targetId);
      if (itemStatus) break;
    }

    if (itemStatus === 'done') {
      const shortTitle = targetTitle.length > 40 ? targetTitle.slice(0, 40) + '...' : targetTitle;
      return json({
        success: false,
        error: `Already complete: ${shortTitle}`,
        hint: 'Item is already done'
      }, { status: 400 });
    }

    // Check for incomplete children before allowing tick
    let incompleteChildren: string[] = [];
    for (const area of spec.areas) {
      incompleteChildren = findIncompleteChildren(area.items, targetId);
      if (incompleteChildren.length > 0) break;
    }

    if (incompleteChildren.length > 0) {
      return json({
        success: false,
        error: `Cannot complete - ${incompleteChildren.length} sub-item(s) still open`,
        incompleteItems: incompleteChildren,
        hint: 'Complete sub-items first, or use chkd done --force to skip'
      }, { status: 400 });
    }

    // DEBOUNCE: Block tick if working was called less than 10 seconds ago
    // This prevents batch calls like: chkd working && chkd tick
    if (repo && session?.currentItem?.startTime) {
      const startTime = new Date(session.currentItem.startTime + 'Z').getTime();
      const timeSinceWorking = Date.now() - startTime;
      const MIN_WORK_TIME_MS = 10000; // 10 seconds

      if (timeSinceWorking < MIN_WORK_TIME_MS) {
        const remainingSeconds = Math.ceil((MIN_WORK_TIME_MS - timeSinceWorking) / 1000);
        return json({
          success: false,
          error: `Too fast! You called "working" ${Math.floor(timeSinceWorking / 1000)}s ago.`,
          hint: `Do the actual work first, then tick. Wait ${remainingSeconds} more seconds or actually build the feature.`,
          debounceRemaining: remainingSeconds
        }, { status: 400 });
      }
    }

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

    // If ticking a top-level item (no parent), clear the session
    if (repo && !parentId) {
      clearSession(repo.id);
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
