import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession, saveItemDuration, updateSession, clearSession } from '$lib/server/db/queries';
import { clearQueue } from '$lib/server/proposal';
import {
  findItemByQuery,
  getItem,
  getChildren,
  getItemsByRepo,
  markItemDone,
  deleteItem
} from '$lib/server/db/items';

// POST /api/spec/tick - Mark an item complete
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery, itemId, confirmFeedback } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    const session = getSession(repo.id);
    const currentTaskId = session?.currentTask?.id;

    // Find the item
    let targetId = itemId;
    let targetTitle = '';

    if (!targetId && itemQuery) {
      // Try to find item by query in DB
      const dbItem = findItemByQuery(repo.id, itemQuery);
      if (dbItem) {
        targetId = dbItem.id;
        targetTitle = dbItem.title;
      } else {
        // If not found and we have a current task, search its children
        if (currentTaskId) {
          const children = getChildren(currentTaskId);
          const queryLower = itemQuery.toLowerCase();
          for (const child of children) {
            if (child.status !== 'done' && child.title.toLowerCase().includes(queryLower)) {
              targetId = child.id;
              targetTitle = child.title;
              break;
            }
          }
        }
      }
    } else if (!targetId) {
      // No query - tick current task
      if (session?.currentTask) {
        targetId = session.currentTask.id;
        targetTitle = session.currentTask.title || '';
      }
    }

    if (!targetId) {
      // Check if session exists but no task vs completely idle
      const sessionExists = session && session.status !== 'idle';
      
      if (!sessionExists && itemQuery) {
        // Session dropped/expired while user thought they were working
        return json({
          success: false,
          error: `Item "${itemQuery}" not found and no active session`,
          hint: 'Session may have expired. Try: 1) Start fresh with chkd start "task" or 2) Use full item title if ticking a specific item'
        }, { status: 400 });
      }
      
      return json({
        success: false,
        error: 'No item specified and no current task',
        hint: 'Start a task first with chkd start "task" or specify an item to tick'
      }, { status: 400 });
    }

    // Get the item from DB
    const dbItem = getItem(targetId) || findItemByQuery(repo.id, targetId);
    if (!dbItem) {
      return json({ success: false, error: `Item "${targetId}" not found in database.` }, { status: 404 });
    }

    targetId = dbItem.id;
    if (!targetTitle) targetTitle = dbItem.title;

    // Check if item is already complete
    if (dbItem.status === 'done') {
      const shortTitle = targetTitle.length > 40 ? targetTitle.slice(0, 40) + '...' : targetTitle;
      return json({
        success: false,
        error: `Already complete: ${shortTitle}`,
        hint: 'Item is already done'
      }, { status: 400 });
    }

    // Check for incomplete children before allowing tick
    const children = getChildren(dbItem.id);
    const incompleteChildren = children.filter(c => c.status !== 'done').map(c => c.title);

    if (incompleteChildren.length > 0) {
      return json({
        success: false,
        error: `Cannot complete - ${incompleteChildren.length} sub-item(s) still open`,
        incompleteItems: incompleteChildren,
        hint: 'Complete sub-items first, or use chkd done --force to skip'
      }, { status: 400 });
    }

    // DEBOUNCE: Block tick if working was called less than 2 seconds ago
    if (session?.currentItem?.startTime) {
      const startTime = new Date(session.currentItem.startTime + 'Z').getTime();
      const timeSinceWorking = Date.now() - startTime;
      const MIN_WORK_TIME_MS = 2000; // 2 seconds

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

    // Get parent info for response
    let parentTitle = '';
    let parentId = '';
    let hasMoreSiblings = false;

    if (dbItem.parentId) {
      const parent = getItem(dbItem.parentId);
      if (parent) {
        parentId = parent.id;
        parentTitle = parent.title;
        // Check for more incomplete siblings
        const siblings = getChildren(parent.id);
        hasMoreSiblings = siblings.some(s => s.id !== dbItem.id && s.status !== 'done');
      }
    }

    // Mark done in DB
    markItemDone(dbItem.id);

    // If this is a top-level item, delete completed children from DB
    if (!dbItem.parentId) {
      const childrenToClean = getChildren(dbItem.id);
      for (const child of childrenToClean) {
        if (child.status === 'done') {
          deleteItem(child.id);
        }
      }
    }

    // Save item duration if we were tracking this item
    if (session?.currentItem?.startTime) {
      const startTime = new Date(session.currentItem.startTime + 'Z').getTime();
      const durationMs = Date.now() - startTime;
      if (durationMs > 0) {
        saveItemDuration(repo.id, targetId, durationMs);
      }
      // Clear current item
      updateSession(repo.id, { currentItem: null });
    }

    // If ticking a top-level item (no parent), clear the session
    if (!parentId) {
      clearSession(repo.id);
    }

    // Get and clear queued items (user added while Claude was working)
    const queuedItems = clearQueue(repoPath);

    // Check for rapid ticks (rate limiting)
    const lastTickKey = `lastTick:${repo.id}`;
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
