import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { markItemComplete } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/spec/tick - Mark an item complete
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery, itemId } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Find the item
    let targetId = itemId;
    let targetTitle = '';

    if (!targetId && itemQuery) {
      // Search by query
      const sectionMatch = itemQuery.match(/^(\d+)\.(\d+)/);

      for (const phase of spec.phases) {
        for (let i = 0; i < phase.items.length; i++) {
          const item = phase.items[i];

          if (sectionMatch) {
            const phaseNum = parseInt(sectionMatch[1]);
            const itemNum = parseInt(sectionMatch[2]);
            if (phase.number === phaseNum && (i + 1) === itemNum) {
              targetId = item.id;
              targetTitle = item.title;
              break;
            }
          }

          if (item.title.toLowerCase().includes(itemQuery.toLowerCase())) {
            targetId = item.id;
            targetTitle = item.title;
            break;
          }
        }
        if (targetId) break;
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

    // Find title if not set
    if (!targetTitle) {
      for (const phase of spec.phases) {
        for (const item of phase.items) {
          if (item.id === targetId) {
            targetTitle = item.title;
            break;
          }
        }
      }
    }

    await markItemComplete(specPath, targetId);

    return json({
      success: true,
      data: {
        itemId: targetId,
        title: targetTitle,
        message: `Marked complete: ${targetTitle}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
