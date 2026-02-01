import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, startSession, createRepo } from '$lib/server/db/queries';
import { findItemByQuery, updateItem } from '$lib/server/db/items';
import path from 'path';

// POST /api/session/start - Start working on a task
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, taskQuery, taskId } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    // Find or create repo
    let repo = getRepoByPath(repoPath);
    if (!repo) {
      // Auto-register the repo
      const repoName = path.basename(repoPath);
      repo = createRepo(repoPath, repoName);
    }

    const query = taskId || taskQuery;
    if (!query) {
      return json({ success: false, error: 'taskQuery or taskId is required' }, { status: 400 });
    }

    // Find the task in DB
    const dbItem = findItemByQuery(repo.id, query);
    if (!dbItem) {
      return json({
        success: false,
        error: `No task found matching "${query}"`,
        suggestion: 'Try a section number like "SD.1" or part of the task title'
      }, { status: 404 });
    }

    // Can only start top-level items (not children)
    if (dbItem.parentId) {
      return json({
        success: false,
        error: 'Cannot start a sub-task directly. Start the parent task instead.',
        hint: `Use: chkd start "${dbItem.displayId.split('.').slice(0, 2).join('.')}"`
      }, { status: 400 });
    }

    const wasDone = dbItem.status === 'done';

    // Check for TBC fields before allowing work to start
    const tbcFields: string[] = [];
    if (!dbItem.keyRequirements?.length || dbItem.keyRequirements.includes('TBC')) {
      tbcFields.push('Key Requirements');
    }
    if (!dbItem.filesToChange?.length || dbItem.filesToChange.includes('TBC')) {
      tbcFields.push('Files to Change');
    }
    if (!dbItem.testing?.length || dbItem.testing.includes('TBC')) {
      tbcFields.push('Testing');
    }

    if (tbcFields.length > 0) {
      const fieldList = tbcFields.join(', ');
      const firstField = tbcFields[0].toLowerCase().replace(/ /g, '');
      return json({
        success: false,
        error: `Cannot start - incomplete spec. Missing: ${fieldList}`,
        hint: `Fill in details: chkd edit "${query}" --${firstField} "..." (or use the UI)`,
        tbcFields,
        requiresEdit: true
      }, { status: 400 });
    }

    // If task was done, reopen it
    if (wasDone) {
      updateItem(dbItem.id, { status: 'open' });
    }

    // Start the session
    startSession(repo.id, dbItem.id, dbItem.title, 0);

    return json({
      success: true,
      data: {
        taskId: dbItem.id,
        taskTitle: dbItem.title,
        areaCode: dbItem.areaCode,
        iteration: 1,
        startTime: new Date().toISOString(),
        reopened: wasDone,
        // Task context for display
        context: {
          story: dbItem.story,
          keyRequirements: dbItem.keyRequirements,
          filesToChange: dbItem.filesToChange,
          testing: dbItem.testing,
        },
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
