import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';

// POST /api/terminal/kill - Kill a tmux session
export const POST: RequestHandler = async ({ url }) => {
  try {
    const session = url.searchParams.get('session');

    if (!session) {
      return json({ success: false, error: 'session parameter required' }, { status: 400 });
    }

    // Only allow killing chkd_ prefixed sessions for safety
    if (!session.startsWith('chkd_')) {
      return json({ success: false, error: 'Can only kill chkd sessions' }, { status: 400 });
    }

    try {
      execSync(`tmux kill-session -t ${session} 2>/dev/null`);
    } catch {
      // Session might not exist, that's ok
    }

    return json({ success: true, data: { message: `Session ${session} killed` } });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
