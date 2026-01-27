import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWorkflowByType } from '$lib/server/spec/writer';
import { addDeviation, addScopeChange } from '$lib/server/proposal';
import { updateSession, getRepoByPath } from '$lib/server/db/queries';
import { createItem, getNextSectionNumber } from '$lib/server/db/items';
import type { AreaCode } from '$lib/types';

// POST /api/session/deviate - Quick add off-plan item to spec and log deviation
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, description, areaCode, setAsCurrent } = body;

    if (!repoPath || !title) {
      return json({ success: false, error: 'repoPath and title are required' }, { status: 400 });
    }

    // Get repo to find ID
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Default to Frontend if no area specified
    const targetArea = (areaCode || 'FE') as AreaCode;

    // Create item in DB
    const sectionNumber = getNextSectionNumber(repo.id, targetArea);
    const displayId = `${targetArea}.${sectionNumber}`;
    const fullTitle = `${displayId} ${title}`;

    const newItem = createItem({
      repoId: repo.id,
      displayId,
      title: fullTitle,
      description: description || undefined,
      areaCode: targetArea,
      sectionNumber,
      sortOrder: sectionNumber - 1,
      status: 'open',
      priority: 'medium'
    });

    // Add workflow sub-tasks
    const tasks = getWorkflowByType(undefined, targetArea);
    tasks.forEach((taskTitle: string, index: number) => {
      createItem({
        repoId: repo.id,
        displayId: `${displayId}.${index + 1}`,
        title: taskTitle,
        areaCode: targetArea,
        sectionNumber,
        parentId: newItem.id,
        sortOrder: index,
        status: 'open',
        priority: 'medium'
      });
    });

    // Log the scope change
    addScopeChange(repoPath, {
      type: 'added',
      itemId: newItem.id,
      title,
      timestamp: new Date(),
    });

    // Log the deviation
    addDeviation(repoPath, {
      request: title,
      handled: 'added',
      timestamp: new Date(),
    });

    // Optionally set as current task
    if (setAsCurrent) {
      updateSession(repo.id, {
        currentTask: { id: newItem.id, title, phase: null },
        status: 'building',
        startTime: new Date().toISOString(),
      });
    }

    return json({
      success: true,
      data: {
        itemId: newItem.id,
        sectionId: displayId,
        addedToArea: targetArea,
        isCurrentTask: setAsCurrent || false,
        message: `Added "${title}" to ${targetArea}`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
