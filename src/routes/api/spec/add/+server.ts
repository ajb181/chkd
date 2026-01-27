import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser } from '$lib/server/spec/parser';
import { getWorkflowByType } from '$lib/server/spec/writer';
import { getRepoByPath } from '$lib/server/db/queries';
import { createItem, getNextSectionNumber, searchItems } from '$lib/server/db/items';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

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

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Validate area exists
    const area = spec.areas.find(a => a.code === areaCode);
    if (!area) {
      const availableAreas = spec.areas.map(a => `${a.code} (${a.name})`).join(', ');
      return json({
        success: false,
        error: `Area "${areaCode}" not found`,
        hint: `Available areas: ${availableAreas}`
      }, { status: 400 });
    }

    // Determine which tasks will be added
    const tasksToAdd = withWorkflow
      ? (tasks && tasks.length > 0 ? tasks : getWorkflowByType(workflowType, areaCode))
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

    // Check for duplicates
    const allItems = spec.areas.flatMap(a => a.items);
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

    // Write to DB (no fallback)
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
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

    // Create workflow sub-tasks
    if (tasksToAdd.length > 0) {
      tasksToAdd.forEach((taskTitle, index) => {
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
        line: result.line,
        title: result.title,
        description: description || null,
        tasksAdded: tasksToAdd,
        taskCount: tasksToAdd.length,
        message: `Added "${title}" to ${area.name} with ${tasksToAdd.length} sub-tasks`
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
