import * as pty from 'node-pty';
import { execSync, spawn } from 'child_process';
import type { IPty } from 'node-pty';

interface TerminalSession {
  id: string;
  pty: IPty;
  tmuxSession: string;
  lastActivity: Date;
}

const sessions = new Map<string, TerminalSession>();

// Get or create a tmux session for a repo
export function getSessionName(repoPath: string): string {
  // Create a safe session name from repo path
  const safeName = repoPath
    .replace(/^\/Users\/[^/]+\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 50);
  return `chkd_${safeName}`;
}

// Check if tmux session exists
function tmuxSessionExists(sessionName: string): boolean {
  try {
    execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

// Create or attach to a tmux session
export function createTerminal(repoPath: string): TerminalSession {
  const sessionName = getSessionName(repoPath);
  const sessionId = `${sessionName}_${Date.now()}`;

  let shell: string;
  let args: string[];

  if (tmuxSessionExists(sessionName)) {
    // Attach to existing session
    shell = 'tmux';
    args = ['attach-session', '-t', sessionName];
  } else {
    // Create new session in the repo directory
    shell = 'tmux';
    args = ['new-session', '-s', sessionName, '-c', repoPath];
  }

  const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: repoPath,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
    },
  });

  const session: TerminalSession = {
    id: sessionId,
    pty: ptyProcess,
    tmuxSession: sessionName,
    lastActivity: new Date(),
  };

  sessions.set(sessionId, session);

  return session;
}

// Get terminal by session ID
export function getTerminal(sessionId: string): TerminalSession | undefined {
  return sessions.get(sessionId);
}

// Resize terminal
export function resizeTerminal(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.pty.resize(cols, rows);
  }
}

// Write to terminal
export function writeTerminal(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.pty.write(data);
    session.lastActivity = new Date();
  }
}

// Close terminal (but keep tmux session alive)
export function closeTerminal(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    // Detach from tmux instead of killing it
    session.pty.write('\x02d'); // Ctrl+B, d (tmux detach)
    setTimeout(() => {
      session.pty.kill();
      sessions.delete(sessionId);
    }, 100);
  }
}

// Kill tmux session entirely
export function killTmuxSession(repoPath: string): void {
  const sessionName = getSessionName(repoPath);
  try {
    execSync(`tmux kill-session -t ${sessionName} 2>/dev/null`);
  } catch {
    // Session might not exist
  }
}

// List active terminal sessions
export function listSessions(): { id: string; tmuxSession: string; lastActivity: Date }[] {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    tmuxSession: s.tmuxSession,
    lastActivity: s.lastActivity,
  }));
}

// Check if tmux session is active for a repo
export function hasActiveSession(repoPath: string): boolean {
  const sessionName = getSessionName(repoPath);
  return tmuxSessionExists(sessionName);
}
