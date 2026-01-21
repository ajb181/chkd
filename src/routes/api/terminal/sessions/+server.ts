import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';

interface TmuxSession {
  name: string;
  created: string;
  attached: boolean;
  windows: number;
}

function listTmuxSessions(): TmuxSession[] {
  try {
    // Get tmux sessions with format: name:created:attached:windows
    const output = execSync('tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}:#{session_windows}"', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    return output
      .trim()
      .split('\n')
      .filter(line => line.startsWith('chkd_')) // Only chkd sessions
      .map(line => {
        const [name, created, attached, windows] = line.split(':');
        return {
          name,
          created: new Date(parseInt(created) * 1000).toISOString(),
          attached: attached === '1',
          windows: parseInt(windows) || 1,
        };
      });
  } catch (error) {
    // No tmux sessions or tmux not running
    return [];
  }
}

// GET /api/terminal/sessions - List active tmux sessions
export const GET: RequestHandler = async () => {
  try {
    const sessions = listTmuxSessions();

    return json({
      success: true,
      data: {
        sessions,
        count: sessions.length,
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
