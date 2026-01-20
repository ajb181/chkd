import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addFeatureWithWorkflow } from '$lib/server/spec/writer';
import { addDeviation, addScopeChange } from '$lib/server/proposal';
import { getSession, updateSession, getRepoByPath } from '$lib/server/db/queries';
import path from 'path';

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

    // Add item to spec with workflow template
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    // Default to Frontend if no area specified
    const targetArea = areaCode || 'FE';

    const result = await addFeatureWithWorkflow(specPath, targetArea, title, description);

    // Log the scope change
    addScopeChange(repoPath, {
      type: 'added',
      itemId: result.itemId,
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
        currentTask: { id: result.itemId, title, phase: null },
        status: 'building',
        startTime: new Date().toISOString(),
      });
    }

    return json({
      success: true,
      data: {
        itemId: result.itemId,
        addedToArea: targetArea,
        line: result.line,
        isCurrentTask: setAsCurrent || false,
        message: `Added "${title}" to ${targetArea}`,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
