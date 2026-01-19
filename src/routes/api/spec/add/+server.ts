import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import { addItem, addFeatureWithWorkflow } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/spec/add - Add a new item to the spec
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, description, phaseNumber, withWorkflow = true } = body;

    if (!repoPath || !title) {
      return json({ success: false, error: 'repoPath and title are required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Determine target phase
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
      return json({ success: false, error: 'No phase found to add item to' }, { status: 400 });
    }

    // Add the item (with workflow template if requested)
    let result;
    if (withWorkflow) {
      result = await addFeatureWithWorkflow(specPath, targetPhase, title, description);
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
        message: `Added "${title}" to Phase ${targetPhase}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
