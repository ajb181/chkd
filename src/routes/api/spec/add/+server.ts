import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWorkflowByType } from '$lib/server/spec/workflow';
import { getRepoByPath } from '$lib/server/db/queries';
import { createItem, getNextSectionNumber, searchItems, getItemsByRepo } from '$lib/server/db/items';
import type { AreaCode } from '$lib/types';

// Known parameters for validation
const KNOWN_PARAMS = [
  'repoPath', 'title', 'description', 'areaCode',
  'withWorkflow', 'workflowType', 'tasks', 'dryRun', 'confirmLarge',
  'story', 'keyRequirements', 'filesToChange', 'testing', 'fileLink'
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
      withWorkflow = true,
      workflowType,
      tasks,
      dryRun = false,
      confirmLarge = false,
      // Metadata fields
      story,
      keyRequirements,
      filesToChange,
      testing,
      fileLink
    } = body;

    // Collect warnings
    const warnings: string[] = [];

    // Check for unknown parameters
    const unknownParams = Object.keys(body).filter(k => !KNOWN_PARAMS.includes(k));
    if (unknownParams.length > 0) {
      warnings.push(`Unknown parameters ignored: ${unknownParams.join(', ')}`);
    }

    // Validate required params
    if (!repoPath || !title || !areaCode) {
      return json({
        success: false,
        error: 'repoPath, title, and areaCode are required',
        hint: 'Required: repoPath, title, areaCode (SD/FE/BE/FUT). Optional: description, story, keyRequirements[], filesToChange[], testing[], tasks[], withWorkflow, dryRun'
      }, { status: 400 });
    }

    // Validate area code
    const validAreas: AreaCode[] = ['SD', 'FE', 'BE', 'FUT'];
    const areaNames: Record<string, string> = {
      'SD': 'Site Design',
      'FE': 'Frontend',
      'BE': 'Backend',
      'FUT': 'Future Areas'
    };

    if (!validAreas.includes(areaCode as AreaCode)) {
      const availableAreas = validAreas.map(code => `${code} (${areaNames[code]})`).join(', ');
      return json({
        success: false,
        error: `Area "${areaCode}" not found`,
        hint: `Available areas: ${availableAreas}`
      }, { status: 400 });
    }

    // Get repo from DB first (needed for duplicate check)
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    // Determine which tasks will be added
    // getWorkflowByType returns WorkflowStep[] with { task, children } - extract task strings
    const workflowSteps = getWorkflowByType(workflowType, areaCode);
    const tasksToAdd: string[] = withWorkflow
      ? (tasks && tasks.length > 0 ? tasks : workflowSteps.map(step => step.task))
      : [];

    // Check for large additions
    if (tasksToAdd.length > 10 && !confirmLarge) {
      return json({
        success: false,
        error: `Adding ${tasksToAdd.length} sub-tasks requires confirmation`,
        hint: 'Set confirmLarge: true to proceed with large additions',
        preview: { title, taskCount: tasksToAdd.length, tasks: tasksToAdd }
      }, { status: 400 });
    }

    // Check for duplicates in DB
    const allItems = getItemsByRepo(repo.id);
    const titleLower = title.toLowerCase();
    const similarItem = allItems.find(i => {
      const itemTitleLower = i.title.toLowerCase();
      return itemTitleLower === titleLower ||
        itemTitleLower.includes(titleLower) ||
        titleLower.includes(itemTitleLower);
    });

    if (similarItem) {
      return json({
        success: false,
        error: `Similar item already exists: "${similarItem.title}"`,
        existingItem: { id: similarItem.id, title: similarItem.title, status: similarItem.status },
        hint: 'Use a different title or edit the existing item'
      }, { status: 409 });
    }

    const area = { name: areaNames[areaCode as AreaCode] };

    // Dry run - return what would be created
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
            story: story || null,
            keyRequirements: keyRequirements || ['TBC'],
            filesToChange: filesToChange || ['TBC'],
            testing: testing || ['TBC'],
            withWorkflow,
            tasks: tasksToAdd,
            taskCount: tasksToAdd.length
          },
          message: `Would add "${title}" to ${area.name} with ${tasksToAdd.length} sub-tasks`
        },
        warnings: warnings.length > 0 ? warnings : undefined
      });
    }

    // Create in DB
    const sectionNumber = getNextSectionNumber(repo.id, areaCode as any);
    const displayId = `${areaCode}.${sectionNumber}`;
    const fullTitle = `${displayId} ${title}`;

    const newItem = createItem({
      repoId: repo.id,
      displayId,
      title: fullTitle,
      description: description || undefined,
      story: story || undefined,
      keyRequirements: Array.isArray(keyRequirements) ? keyRequirements : undefined,
      filesToChange: Array.isArray(filesToChange) ? filesToChange : undefined,
      testing: Array.isArray(testing) ? testing : undefined,
      areaCode: areaCode as any,
      sectionNumber,
      sortOrder: sectionNumber - 1,
      status: 'open',
      priority: 'medium'
    });

    // Create workflow sub-tasks with nested children (the 8-step workflow)
    if (withWorkflow && !tasks?.length) {
      // Use full workflow structure with children
      workflowSteps.forEach((step, stepIndex: number) => {
        const stepItem = createItem({
          repoId: repo.id,
          displayId: `${displayId}.${stepIndex + 1}`,
          title: step.task,
          areaCode: areaCode as any,
          sectionNumber,
          parentId: newItem.id,
          sortOrder: stepIndex,
          status: 'open',
          priority: 'medium'
        });

        // Create children as nested checkpoints
        if (step.children && step.children.length > 0) {
          step.children.forEach((childTitle: string, childIndex: number) => {
            createItem({
              repoId: repo.id,
              displayId: `${displayId}.${stepIndex + 1}.${childIndex + 1}`,
              title: childTitle,
              areaCode: areaCode as any,
              sectionNumber,
              parentId: stepItem.id,
              sortOrder: childIndex,
              status: 'open',
              priority: 'medium'
            });
          });
        }
      });
    } else if (tasksToAdd.length > 0) {
      // Custom tasks provided - create flat structure
      tasksToAdd.forEach((taskTitle: string, index: number) => {
        createItem({
          repoId: repo.id,
          displayId: `${displayId}.${index + 1}`,
          title: taskTitle,
          areaCode: areaCode as any,
          sectionNumber,
          parentId: newItem.id,
          sortOrder: index,
          status: 'open',
          priority: 'medium'
        });
      });
    }

    // Calculate total items created (steps + their children)
    const totalSteps = withWorkflow && !tasks?.length ? workflowSteps.length : tasksToAdd.length;
    const totalChildren = withWorkflow && !tasks?.length 
      ? workflowSteps.reduce((sum, step) => sum + (step.children?.length || 0), 0)
      : 0;
    const totalCreated = totalSteps + totalChildren;

    const result = {
      itemId: newItem.id,
      sectionId: displayId,
      areaCode,
      title: fullTitle
    };

    return json({
      success: true,
      data: {
        itemId: result.itemId,
        sectionId: result.sectionId,
        areaCode: result.areaCode,
        areaName: area.name,
        title: result.title,
        description: description || null,
        tasksAdded: withWorkflow && !tasks?.length ? workflowSteps.map(s => s.task) : tasksToAdd,
        taskCount: totalSteps,
        checkpointCount: totalChildren,
        totalItemsCreated: totalCreated,
        message: `Added "${title}" to ${area.name} with ${totalSteps} workflow steps and ${totalChildren} checkpoints`
      },
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    return json({
      success: false,
      error: String(error),
      hint: 'Check that repoPath is valid and the repository is registered in chkd'
    }, { status: 500 });
  }
};
