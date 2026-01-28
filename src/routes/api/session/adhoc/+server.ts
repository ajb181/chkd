import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSession } from '$lib/server/db/queries';
import { getDb } from '$lib/server/db';

// POST /api/session/adhoc - Start an adhoc session (impromptu, debug, or quickwin)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, type, mode: modeParam, description, quickwinId } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    // Accept either 'type' (legacy) or 'mode' (new)
    const inputType = type || modeParam;
    if (!inputType || !['impromptu', 'debug', 'quickwin'].includes(inputType)) {
      return json({
        success: false,
        error: 'type must be "impromptu", "debug", or "quickwin"'
      }, { status: 400 });
    }

    if (!description) {
      return json({
        success: false,
        error: 'description is required',
        hint: `Usage: chkd ${inputType} "what you're working on"`
      }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Check if there's already an active session
    const currentSession = getSession(repo.id);
    if (currentSession?.currentTask || currentSession?.status === 'building') {
      return json({
        success: false,
        error: 'Already have an active session',
        hint: 'Use "chkd done" or "chkd sync idle" to end the current session first'
      }, { status: 400 });
    }

    // Start adhoc session - use existing session fields creatively:
    // - status = 'building' (so UI knows we're active)
    // - mode = 'impromptu', 'debugging', or 'quickwin'
    // - current_task_id = null (no spec task) or quickwinId
    // - current_task_title = description (what we're working on)
    const db = getDb();
    const mode = inputType === 'debug' ? 'debugging' :
                 inputType === 'quickwin' ? 'quickwin' : 'impromptu';

    // For quickwin, store the quickwinId so we can auto-complete it
    const taskId = quickwinId || null;

    db.prepare(`
      INSERT INTO sessions (repo_id, current_task_id, current_task_title, current_task_phase, status, mode, start_time, iteration, last_activity)
      VALUES (?, ?, ?, NULL, 'building', ?, datetime('now'), 1, datetime('now'))
      ON CONFLICT(repo_id) DO UPDATE SET
        current_task_id = ?,
        current_task_title = excluded.current_task_title,
        current_task_phase = NULL,
        current_item_id = NULL,
        current_item_title = NULL,
        current_item_start_time = NULL,
        status = 'building',
        mode = ?,
        start_time = datetime('now'),
        iteration = 1,
        last_activity = datetime('now'),
        bug_fixes = '[]',
        scope_changes = '[]',
        deviations = '[]',
        files_changed = '[]',
        also_did = '[]',
        updated_at = datetime('now')
    `).run(repo.id, taskId, description, mode, taskId, mode);

    const emoji = inputType === 'debug' ? '🔧' :
                  inputType === 'quickwin' ? '⚡' : '⚡';
    const stateLabel = inputType === 'debug' ? 'Debug' :
                       inputType === 'quickwin' ? 'Quick win' : 'Impromptu';

    return json({
      success: true,
      data: {
        type: inputType,
        mode,
        description,
        quickwinId: taskId,
        message: `${emoji} ${stateLabel} session started: ${description}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
