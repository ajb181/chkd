import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser } from '$lib/server/spec/parser';
import { addItem, addItemToArea, addFeatureWithWorkflow, DEFAULT_WORKFLOW_STEPS } from '$lib/server/spec/writer';
import path from 'path';

// Known parameters for validation
const KNOWN_PARAMS = [
  'repoPath', 'title', 'description', 'areaCode', 'phaseNumber',
  'withWorkflow', 'tasks', 'customTasks', 'dryRun', 'confirmLarge'
];

// POST /api/spec/add - Add a new item to the spec
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      repoPath,
      title,
      description,
      areaCode,
      phaseNumber,
      withWorkflow = true,
      tasks,
      customTasks: customTasksAlt,
      dryRun = false,
      confirmLarge = false
    } = body;

    // Collect warnings
    const warnings: string[] = [];

    // Check for unknown parameters
    const unknownParams = Object.keys(body).filter(k => !KNOWN_PARAMS.includes(k));
    if (unknownParams.length > 0) {
      warnings.push(`Unknown parameters ignored: ${unknownParams.join(', ')}`);
    }

    // Validate required params
    if (!repoPath || !title) {
      return json({
        success: false,
        error: 'repoPath and title are required',
        hint: 'Required: repoPath (string), title (string). Optional: description, areaCode, tasks[], dryRun, confirmLarge'
      }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Validate tasks if provided (accept both 'tasks' and 'customTasks' parameter names)
    const taskList = tasks || customTasksAlt;
    const customTasks = Array.isArray(taskList)
      ? taskList.filter((t: unknown) => typeof t === 'string' && t.trim())
      : undefined;

    // Determine which tasks will be added
    const tasksToAdd = withWorkflow
      ? (customTasks && customTasks.length > 0 ? customTasks : DEFAULT_WORKFLOW_STEPS)
      : [];

    // Check for large additions
    if (tasksToAdd.length > 10 && !confirmLarge) {
      return json({
        success: false,
        error: `Adding ${tasksToAdd.length} sub-tasks requires confirmation`,
        hint: 'Set confirmLarge: true to proceed with large additions',
        preview: {
          title,
          taskCount: tasksToAdd.length,
          tasks: tasksToAdd
        }
      }, { status: 400 });
    }

    // Check for duplicates
    const allItems = spec.areas.flatMap(a => a.items);
    const titleLower = title.toLowerCase();
    const similarItem = allItems.find(i => {
      const itemTitleLower = i.title.toLowerCase();
      // Check for exact match or very similar title
      return itemTitleLower === titleLower ||
        itemTitleLower.includes(titleLower) ||
        titleLower.includes(itemTitleLower);
    });

    if (similarItem) {
      return json({
        success: false,
        error: `Similar item already exists: "${similarItem.title}"`,
        existingItem: {
          id: similarItem.id,
          title: similarItem.title,
          status: similarItem.status
        },
        hint: 'Use a different title or edit the existing item'
      }, { status: 409 });
    }

    // If areaCode is provided, use the new area-based approach
    if (areaCode) {
      const area = spec.areas.find(a => a.code === areaCode);
      if (!area) {
        const availableAreas = spec.areas.map(a => `${a.code} (${a.name})`).join(', ');
        return json({
          success: false,
          error: `Area "${areaCode}" not found`,
          hint: `Available areas: ${availableAreas}`
        }, { status: 400 });
      }

      // Dry run - return what would be created without actually creating it
      if (dryRun) {
        return json({
          success: true,
          dryRun: true,
          data: {
            wouldCreate: {
              title,
              description: description || null,
              areaCode,
              areaName: area.name,
              withWorkflow,
              tasks: tasksToAdd,
              taskCount: tasksToAdd.length
            },
            message: `Would add "${title}" to ${area.name} with ${tasksToAdd.length} sub-tasks`
          },
          warnings: warnings.length > 0 ? warnings : undefined
        });
      }

      // Add the item (with workflow template if requested)
      let result;
      if (withWorkflow) {
        result = await addFeatureWithWorkflow(specPath, areaCode, title, description, customTasks);
      } else {
        result = await addItemToArea(specPath, areaCode, title, description);
      }

      return json({
        success: true,
        data: {
          itemId: result.itemId,
          areaCode,
          areaName: area.name,
          line: result.line,
          title,
          description: description || null,
          tasksAdded: tasksToAdd,
          taskCount: tasksToAdd.length,
          message: `Added "${title}" to ${area.name} with ${tasksToAdd.length} sub-tasks`
        },
        warnings: warnings.length > 0 ? warnings : undefined
      });
    }

    // Fallback: use phase-based approach for backward compat
    let targetPhase = phaseNumber;

    if (!targetPhase) {
      // Find the current in-progress phase, or first incomplete phase
      const inProgress = spec.phases.find(p => p.status === 'in-progress');
      if (inProgress) {
        targetPhase = inProgress.number;
      } else {
        const incomplete = spec.phases.find(p => p.status !== 'complete');
        targetPhase = incomplete?.number || spec.phases[spec.phases.length - 1]?.number;
      }
    }

    if (!targetPhase) {
      return json({
        success: false,
        error: 'No phase found to add item to',
        hint: 'Specify areaCode (e.g., "SD", "FE", "BE") or phaseNumber'
      }, { status: 400 });
    }

    // Dry run for phase-based
    if (dryRun) {
      return json({
        success: true,
        dryRun: true,
        data: {
          wouldCreate: {
            title,
            description: description || null,
            phase: targetPhase,
            withWorkflow,
            tasks: tasksToAdd,
            taskCount: tasksToAdd.length
          },
          message: `Would add "${title}" to Phase ${targetPhase} with ${tasksToAdd.length} sub-tasks`
        },
        warnings: warnings.length > 0 ? warnings : undefined
      });
    }

    // Add the item (with workflow template if requested)
    let result;
    if (withWorkflow) {
      result = await addFeatureWithWorkflow(specPath, targetPhase, title, description, customTasks);
    } else {
      result = await addItem(specPath, targetPhase, title, description);
    }

    return json({
      success: true,
      data: {
        itemId: result.itemId,
        phase: targetPhase,
        line: result.line,
        title,
        description: description || null,
        tasksAdded: tasksToAdd,
        taskCount: tasksToAdd.length,
        message: `Added "${title}" to Phase ${targetPhase} with ${tasksToAdd.length} sub-tasks`
      },
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    return json({
      success: false,
      error: String(error),
      hint: 'Check that repoPath is valid and docs/SPEC.md exists'
    }, { status: 500 });
  }
};
