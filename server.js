import { createServer } from 'http';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';

// Support both regular and stable builds
const BUILD_DIR = process.env.BUILD_DIR || 'build';
const { handler } = await import(`./${BUILD_DIR}/handler.js`);
import { execSync } from 'child_process';

const PORT = process.env.PORT || 3847;

// Terminal session management
const terminalSessions = new Map();

function getSessionName(repoPath) {
  const safeName = repoPath
    .replace(/^\/Users\/[^/]+\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 50);
  return `chkd_${safeName}`;
}

function tmuxSessionExists(sessionName) {
  try {
    execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

// Create HTTP server
const server = createServer((req, res) => {
  handler(req, res, () => {
    res.writeHead(404);
    res.end('Not Found');
  });
});

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/terminal' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const repoPath = url.searchParams.get('repoPath') || process.cwd();
  const targetSession = url.searchParams.get('session'); // Optional: connect to specific session

  console.log(`[Terminal] New connection for: ${repoPath}${targetSession ? ` (session: ${targetSession})` : ''}`);

  const sessionName = targetSession || getSessionName(repoPath);

  // Close any existing connections to the same session to prevent double input
  for (const [existingWs, session] of terminalSessions.entries()) {
    if (session.sessionName === sessionName && existingWs !== ws) {
      console.log(`[Terminal] Closing old connection to session: ${sessionName}`);
      session.pty.kill();
      existingWs.close();
      terminalSessions.delete(existingWs);
    }
  }

  let ptyProcess;

  try {
    if (tmuxSessionExists(sessionName)) {
      // Attach to existing session with mouse enabled
      console.log(`[Terminal] Attaching to existing tmux session: ${sessionName}`);
      // Enable mouse when attaching
      try { execSync(`/opt/homebrew/bin/tmux set -t ${sessionName} mouse on 2>/dev/null`); } catch {}
      ptyProcess = pty.spawn('/opt/homebrew/bin/tmux', ['attach-session', '-t', sessionName], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: repoPath,
        env: { ...process.env, TERM: 'xterm-256color', PATH: process.env.PATH + ':/opt/homebrew/bin' },
      });
    } else {
      // Create new session - use shell to spawn with mouse enabled
      console.log(`[Terminal] Creating new tmux session: ${sessionName}`);
      ptyProcess = pty.spawn('/bin/bash', ['-c',
        `/opt/homebrew/bin/tmux new-session -s ${sessionName} -c "${repoPath}" \\; set mouse on \\; set -ga terminal-overrides ',xterm*:smcup@:rmcup@'`
      ], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: repoPath,
        env: { ...process.env, TERM: 'xterm-256color', PATH: process.env.PATH + ':/opt/homebrew/bin' },
      });
    }

    terminalSessions.set(ws, { pty: ptyProcess, sessionName, repoPath });

    // Send terminal output to WebSocket
    ptyProcess.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[Terminal] PTY exited with code: ${exitCode}`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      }
    });

    // Send initial ready message
    ws.send(JSON.stringify({ type: 'ready', sessionName }));

  } catch (err) {
    console.error('[Terminal] Error creating terminal:', err);
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
    return;
  }

  // Handle messages from WebSocket
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      const session = terminalSessions.get(ws);

      if (!session) return;

      switch (msg.type) {
        case 'input':
          session.pty.write(msg.data);
          break;

        case 'resize':
          session.pty.resize(msg.cols, msg.rows);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (err) {
      console.error('[Terminal] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Terminal] Connection closed');
    const session = terminalSessions.get(ws);
    if (session) {
      // Detach from tmux (don't kill it)
      session.pty.write('\x02d'); // Ctrl+B, d
      setTimeout(() => {
        session.pty.kill();
        terminalSessions.delete(ws);
      }, 100);
    }
  });

  ws.on('error', (err) => {
    console.error('[Terminal] WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🚀 chkd running at http://localhost:${PORT}`);
  console.log(`  📟 Terminal WebSocket at ws://localhost:${PORT}/terminal\n`);
});
