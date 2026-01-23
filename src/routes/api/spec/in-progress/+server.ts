import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markItemInProgress } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/spec/in-progress - Mark item as in-progress
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemQuery) {
      return json({ success: false, error: 'itemQuery is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    await markItemInProgress(specPath, itemQuery);

    return json({
      success: true,
      data: {
        itemQuery,
        status: 'in-progress',
        message: `In progress: ${itemQuery}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
