import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createEpic,
  listEpicsWithProgress,
  getEpic,
  getEpicWithProgress,
  updateEpicStatus
} from '$lib/server/epic';

// GET /api/epics - List all epics with progress
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const epics = await listEpicsWithProgress(repoPath);

    return json({
      success: true,
      data: epics
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/epics - Create a new epic
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, name, description, scope } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!name) {
      return json({ success: false, error: 'name is required' }, { status: 400 });
    }

    if (!description) {
      return json({ success: false, error: 'description is required' }, { status: 400 });
    }

    const epic = await createEpic(repoPath, name, description, scope);

    return json({
      success: true,
      data: epic
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// PATCH /api/epics - Update epic status
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, query, status } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!query) {
      return json({ success: false, error: 'query (epic name or tag) is required' }, { status: 400 });
    }

    if (!status || !['planning', 'in-progress', 'review', 'complete'].includes(status)) {
      return json({
        success: false,
        error: 'status must be one of: planning, in-progress, review, complete'
      }, { status: 400 });
    }

    const epic = await updateEpicStatus(repoPath, query, status);

    if (!epic) {
      return json({ success: false, error: `Epic not found: "${query}"` }, { status: 404 });
    }

    return json({
      success: true,
      data: epic
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
