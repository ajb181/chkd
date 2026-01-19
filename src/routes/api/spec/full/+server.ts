import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser } from '$lib/server/spec/parser';
import path from 'path';
import fs from 'fs/promises';

// GET /api/spec/full - Get the full parsed spec
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    try {
      await fs.access(specPath);
    } catch {
      return json({ success: false, error: 'No docs/SPEC.md found' }, { status: 404 });
    }

    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    return json({ success: true, data: spec });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
