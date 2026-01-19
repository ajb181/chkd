import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser } from '$lib/server/spec/parser';
import path from 'path';
import fs from 'fs/promises';

// POST /api/session/check - Check if a request is on-plan
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, request: userRequest } = body;

    if (!repoPath || !userRequest) {
      return json({ success: false, error: 'repoPath and request are required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    let spec;

    try {
      await fs.access(specPath);
      const parser = new SpecParser();
      spec = await parser.parseFile(specPath);
    } catch {
      return json({
        success: true,
        data: {
          onPlan: false,
          matchedItem: null,
          suggestion: 'No SPEC.md found - all work is off-plan'
        }
      });
    }

    // Search for matching items
    const query = userRequest.toLowerCase();
    let matchedItem: { id: string; title: string; phase: number } | null = null;

    for (const phase of spec.phases) {
      for (const item of phase.items) {
        const titleLower = item.title.toLowerCase();
        const descLower = item.description.toLowerCase();

        // Check for keyword matches
        const words = query.split(/\s+/).filter(w => w.length > 3);
        const matchCount = words.filter(w =>
          titleLower.includes(w) || descLower.includes(w)
        ).length;

        if (matchCount >= Math.min(2, words.length) || titleLower.includes(query)) {
          matchedItem = {
            id: item.id,
            title: item.title,
            phase: phase.number
          };
          break;
        }
      }
      if (matchedItem) break;
    }

    if (matchedItem) {
      return json({
        success: true,
        data: {
          onPlan: true,
          matchedItem,
          suggestion: `Matches: "${matchedItem.title}" (Phase ${matchedItem.phase})`
        }
      });
    }

    return json({
      success: true,
      data: {
        onPlan: false,
        matchedItem: null,
        suggestion: `"${userRequest}" is not in the spec. Use 'chkd add' to add it.`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
