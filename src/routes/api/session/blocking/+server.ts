import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getBlockingState,
  setBlocking,
  clearBlocking,
  addQueueItem,
  type BlockingState,
} from '$lib/server/proposal';

// GET /api/session/blocking - Get blocking state
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const state = getBlockingState(repoPath);

    return json({
      success: true,
      data: state,
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/session/blocking - Set blocking state (Claude is waiting)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, question, options } = body;

    if (!repoPath || !question) {
      return json({
        success: false,
        error: 'repoPath and question are required',
      }, { status: 400 });
    }

    setBlocking(repoPath, question, options);

    return json({
      success: true,
      data: {
        message: 'Blocking state set',
        question,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// DELETE /api/session/blocking - Clear blocking and optionally respond
export const DELETE: RequestHandler = async ({ url, request }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const response = url.searchParams.get('response');

    if (!repoPath) {
      return json({
        success: false,
        error: 'repoPath is required',
      }, { status: 400 });
    }

    // If a response is provided, add it to the queue
    if (response) {
      addQueueItem(repoPath, `[Response] ${response}`);
    }

    clearBlocking(repoPath);

    return json({
      success: true,
      data: {
        message: response ? 'Blocking cleared with response' : 'Blocking cleared',
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
