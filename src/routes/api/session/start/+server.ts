import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, startSession, createRepo } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { markItemIncomplete, checkItemTbc } from '$lib/server/spec/writer';
import { getHandoverNote, clearHandoverNote } from '$lib/server/proposal';
import path from 'path';
import fs from 'fs/promises';

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

    // Parse spec to find the task
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    let spec;
    try {
      await fs.access(specPath);
      const parser = new SpecParser();
      spec = await parser.parseFile(specPath);
    } catch {
      return json({ success: false, error: 'No docs/SPEC.md found' }, { status: 400 });
    }

    // Find the task - by ID, section ID (e.g. SD.1), or fuzzy match
    let foundTask: {
      id: string;
      title: string;
      areaCode: string;
      wasDone: boolean;
      story?: string;
      keyRequirements?: string[];
      filesToChange?: string[];
      testing?: string[];
    } | null = null;
    const query = taskId || taskQuery;

    if (!query) {
      return json({ success: false, error: 'taskQuery or taskId is required' }, { status: 400 });
    }

    // Try to match by section ID (e.g., "SD.1", "FE.2", "BE.3")
    const sectionMatch = query.toUpperCase().match(/^([A-Z]+)\.(\d+)/);

    for (const area of spec.areas) {
      for (const item of area.items) {
        const wasDone = item.status === 'done' || item.completed;

        // Match by ID
        if (item.id === query) {
          foundTask = {
            id: item.id, title: item.title, areaCode: area.code, wasDone,
            story: item.story, keyRequirements: item.keyRequirements,
            filesToChange: item.filesToChange, testing: item.testing
          };
          break;
        }

        // Match by section ID (e.g., SD.1 matches item with "SD.1" in title)
        if (sectionMatch) {
          const areaCode = sectionMatch[1];
          const itemNum = sectionMatch[2];
          const sectionId = `${areaCode}.${itemNum}`;
          if (item.title.startsWith(sectionId)) {
            foundTask = {
              id: item.id, title: item.title, areaCode: area.code, wasDone,
              story: item.story, keyRequirements: item.keyRequirements,
              filesToChange: item.filesToChange, testing: item.testing
            };
            break;
          }
        }

        // Fuzzy match by title
        if (item.title.toLowerCase().includes(query.toLowerCase())) {
          foundTask = {
            id: item.id, title: item.title, areaCode: area.code, wasDone,
            story: item.story, keyRequirements: item.keyRequirements,
            filesToChange: item.filesToChange, testing: item.testing
          };
          break;
        }
      }
      if (foundTask) break;
    }

    if (!foundTask) {
      return json({
        success: false,
        error: `No task found matching "${query}"`,
        suggestion: 'Try a section number like "4.9" or part of the task title'
      }, { status: 404 });
    }

    // Check for TBC fields before allowing work to start
    try {
      const tbcResult = await checkItemTbc(specPath, foundTask.id);

      if (tbcResult.hasTbc) {
        const fieldList = tbcResult.tbcFields.join(', ');
        const firstField = tbcResult.tbcFields[0].toLowerCase().replace(/ /g, '');
        return json({
          success: false,
          error: `Cannot start - incomplete spec. Missing: ${fieldList}`,
          hint: `Fill in details: chkd edit "${query}" --${firstField} "..." (or edit docs/SPEC.md directly)`,
          tbcFields: tbcResult.tbcFields,
          requiresEdit: true
        }, { status: 400 });
      }
    } catch {
      // If item check fails (e.g., child item), skip TBC validation
    }

    // If task was done, reopen it
    if (foundTask.wasDone) {
      await markItemIncomplete(specPath, foundTask.id);
    }

    // Check for handover note from previous session
    const handover = await getHandoverNote(repoPath, foundTask.id);

    // Start the session (use 0 for phase since we now use areas)
    startSession(repo.id, foundTask.id, foundTask.title, 0);

    // Clear the handover note after retrieving it
    if (handover) {
      await clearHandoverNote(repoPath, foundTask.id);
    }

    return json({
      success: true,
      data: {
        taskId: foundTask.id,
        taskTitle: foundTask.title,
        areaCode: foundTask.areaCode,
        iteration: 1,
        startTime: new Date().toISOString(),
        reopened: foundTask.wasDone,
        handoverNote: handover ? {
          note: handover.note,
          pausedBy: handover.pausedBy,
          pausedAt: handover.createdAt,
        } : null,
        // Task context for display
        context: {
          story: foundTask.story,
          keyRequirements: foundTask.keyRequirements,
          filesToChange: foundTask.filesToChange,
          testing: foundTask.testing,
        },
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
