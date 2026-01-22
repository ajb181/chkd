import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { transferItem } from '$lib/server/spec/writer';
import { getRepoByPath } from '$lib/server/db/queries';
import { promises as fs } from 'fs';
import path from 'path';

// POST /api/spec/transfer - Transfer an item between repos
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { sourceRepoPath, targetRepoPath, itemId, targetAreaCode } = body;

    if (!sourceRepoPath) {
      return json({ success: false, error: 'sourceRepoPath is required' }, { status: 400 });
    }
    if (!targetRepoPath) {
      return json({ success: false, error: 'targetRepoPath is required' }, { status: 400 });
    }
    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }
    if (!targetAreaCode) {
      return json({ success: false, error: 'targetAreaCode is required' }, { status: 400 });
    }

    // Validate repos exist
    const sourceRepo = getRepoByPath(sourceRepoPath);
    const targetRepo = getRepoByPath(targetRepoPath);

    if (!sourceRepo) {
      return json({ success: false, error: `Source repo not found: ${sourceRepoPath}` }, { status: 404 });
    }
    if (!targetRepo) {
      return json({ success: false, error: `Target repo not found: ${targetRepoPath}` }, { status: 404 });
    }

    const sourceSpecPath = path.join(sourceRepoPath, 'docs', 'SPEC.md');
    const targetSpecPath = path.join(targetRepoPath, 'docs', 'SPEC.md');

    // Check if spec files exist
    try {
      await fs.access(sourceSpecPath);
    } catch {
      return json({ success: false, error: 'Source repo has no docs/SPEC.md' }, { status: 404 });
    }

    try {
      await fs.access(targetSpecPath);
    } catch {
      return json({ success: false, error: 'Target repo has no docs/SPEC.md' }, { status: 404 });
    }

    // Perform the transfer
    const result = await transferItem(
      sourceSpecPath,
      targetSpecPath,
      itemId,
      targetAreaCode.toUpperCase()
    );

    return json({
      success: true,
      data: {
        newItemId: result.newItemId,
        line: result.line,
        sourceRepo: sourceRepo.name,
        targetRepo: targetRepo.name,
        targetArea: targetAreaCode.toUpperCase()
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
