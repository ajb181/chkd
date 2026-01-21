// Development server with WebSocket support for terminal
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import { execSync } from 'child_process';

const PORT = parseInt(process.env.PORT || '3847');

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

async function start() {
  // Create Vite dev server
  const vite = await createViteServer({
    server: { port: PORT },
    configFile: './vite.config.ts',
  });

  const httpServer = await vite.listen();
  console.log(`\n  🚀 Dev server running at http://localhost:${PORT}`);

  // Create WebSocket server on the same HTTP server
  const wss = new WebSocketServer({
    server: httpServer.httpServer,
    path: '/terminal'
  });

  console.log(`  📟 Terminal WebSocket at ws://localhost:${PORT}/terminal\n`);

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const repoPath = url.searchParams.get('repoPath') || process.cwd();
    const targetSession = url.searchParams.get('session'); // Optional: connect to specific session

    console.log(`[Terminal] New connection for: ${repoPath}${targetSession ? ` (session: ${targetSession})` : ''}`);

    const sessionName = targetSession || getSessionName(repoPath);
    let ptyProcess;

    try {
      if (tmuxSessionExists(sessionName)) {
        console.log(`[Terminal] Attaching to existing tmux session: ${sessionName}`);
        ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: repoPath,
          env: { ...process.env, TERM: 'xterm-256color' },
        });
      } else {
        console.log(`[Terminal] Creating new tmux session: ${sessionName}`);
        ptyProcess = pty.spawn('tmux', ['new-session', '-s', sessionName, '-c', repoPath], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: repoPath,
          env: { ...process.env, TERM: 'xterm-256color' },
        });
      }

      terminalSessions.set(ws, { pty: ptyProcess, sessionName, repoPath });

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

      ws.send(JSON.stringify({ type: 'ready', sessionName }));

    } catch (err) {
      console.error('[Terminal] Error creating terminal:', err);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      ws.close();
      return;
    }

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
        session.pty.write('\x02d'); // Ctrl+B, d (detach from tmux)
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
}

start().catch(console.error);
