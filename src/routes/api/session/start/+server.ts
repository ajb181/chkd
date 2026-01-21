import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, startSession, createRepo } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { markItemIncomplete } from '$lib/server/spec/writer';
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

    // Find the task - by ID, section number, or fuzzy match
    let foundTask: { id: string; title: string; phase: number; wasDone: boolean } | null = null;
    const query = taskId || taskQuery;

    if (!query) {
      return json({ success: false, error: 'taskQuery or taskId is required' }, { status: 400 });
    }

    // Try to match by section number (e.g., "4.9" or "4.9.1")
    const sectionMatch = query.match(/^(\d+)\.(\d+)/);

    for (const phase of spec.phases) {
      for (let i = 0; i < phase.items.length; i++) {
        const item = phase.items[i];
        const wasDone = item.status === 'done' || item.completed;

        // Match by ID
        if (item.id === query) {
          foundTask = { id: item.id, title: item.title, phase: phase.number, wasDone };
          break;
        }

        // Match by section number (phase.itemIndex)
        if (sectionMatch) {
          const phaseNum = parseInt(sectionMatch[1]);
          const itemNum = parseInt(sectionMatch[2]);
          if (phase.number === phaseNum && (i + 1) === itemNum) {
            foundTask = { id: item.id, title: item.title, phase: phase.number, wasDone };
            break;
          }
        }

        // Fuzzy match by title
        if (item.title.toLowerCase().includes(query.toLowerCase())) {
          foundTask = { id: item.id, title: item.title, phase: phase.number, wasDone };
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

    // If task was done, reopen it
    if (foundTask.wasDone) {
      await markItemIncomplete(specPath, foundTask.id);
    }

    // Check for handover note from previous session
    const handover = await getHandoverNote(repoPath, foundTask.id);

    // Start the session
    startSession(repo.id, foundTask.id, foundTask.title, foundTask.phase);

    // Clear the handover note after retrieving it
    if (handover) {
      await clearHandoverNote(repoPath, foundTask.id);
    }

    return json({
      success: true,
      data: {
        taskId: foundTask.id,
        taskTitle: foundTask.title,
        phase: foundTask.phase,
        iteration: 1,
        startTime: new Date().toISOString(),
        reopened: foundTask.wasDone,
        handoverNote: handover ? {
          note: handover.note,
          pausedBy: handover.pausedBy,
          pausedAt: handover.createdAt,
        } : null,
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
