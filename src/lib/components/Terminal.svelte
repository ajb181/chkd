<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  export let repoPath: string = '';
  export let visible: boolean = true;

  interface TmuxSession {
    name: string;
    created: string;
    attached: boolean;
    windows: number;
  }

  let terminalRef: HTMLDivElement;
  let terminal: any = null;
  let fitAddon: any = null;
  let ws: WebSocket | null = null;
  let connected = false;
  let sessionName = '';
  let reconnecting = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Dynamic module references
  let TerminalClass: any = null;
  let FitAddonClass: any = null;
  let modulesLoaded = false;

  // Session selector
  let availableSessions: TmuxSession[] = [];
  let showSessionSelector = false;
  let loadingSessions = false;

  // Load xterm modules dynamically
  async function loadModules() {
    if (modulesLoaded || !browser) return;

    const [xtermModule, fitModule] = await Promise.all([
      import('xterm'),
      import('@xterm/addon-fit'),
    ]);

    // Load CSS
    await import('xterm/css/xterm.css');

    TerminalClass = xtermModule.Terminal;
    FitAddonClass = fitModule.FitAddon;
    modulesLoaded = true;
  }

  async function loadSessions() {
    loadingSessions = true;
    try {
      const res = await fetch('/api/terminal/sessions');
      const data = await res.json();
      if (data.success) {
        availableSessions = data.data.sessions;
      }
    } catch (err) {
      console.error('[Terminal] Failed to load sessions:', err);
    }
    loadingSessions = false;
  }

  function switchSession(session: TmuxSession) {
    showSessionSelector = false;
    // Disconnect current
    if (ws) {
      ws.close();
    }
    if (terminal) {
      terminal.clear();
    }
    // Connect to new session via session name
    sessionName = session.name;
    // The WebSocket URL will be modified to include the session
    connectToSession(session.name);
  }

  function getWebSocketUrl(targetSession?: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const params = new URLSearchParams();
    if (repoPath) params.set('repoPath', repoPath);
    if (targetSession) params.set('session', targetSession);
    const query = params.toString();
    return `${protocol}//${host}/terminal${query ? '?' + query : ''}`;
  }

  function connectToSession(targetSession?: string) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    const url = getWebSocketUrl(targetSession);
    console.log('[Terminal] Connecting to:', url);

    ws = new WebSocket(url);
    setupWebSocketHandlers();
  }

  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const url = getWebSocketUrl();
    console.log('[Terminal] Connecting to:', url);

    ws = new WebSocket(url);
    setupWebSocketHandlers();
  }

  function setupWebSocketHandlers() {
    if (!ws) return;

    ws.onopen = () => {
      console.log('[Terminal] Connected');
      connected = true;
      reconnecting = false;
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'ready':
            sessionName = msg.sessionName;
            terminal?.write('\r\n\x1b[32m✓ Connected to tmux session: ' + sessionName + '\x1b[0m\r\n\r\n');
            break;

          case 'output':
            terminal?.write(msg.data);
            break;

          case 'exit':
            terminal?.write('\r\n\x1b[33m[Session ended]\x1b[0m\r\n');
            connected = false;
            break;

          case 'error':
            terminal?.write('\r\n\x1b[31mError: ' + msg.message + '\x1b[0m\r\n');
            break;

          case 'pong':
            // Keepalive response
            break;
        }
      } catch (err) {
        console.error('[Terminal] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Terminal] Disconnected');
      connected = false;

      // Clear terminal on disconnect to avoid stale content
      terminal?.clear();
      terminal?.write('\x1b[33m[Disconnected]\x1b[0m\r\n');

      // Try to reconnect
      if (!reconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnecting = true;
        reconnectAttempts++;
        terminal?.write(`\x1b[33m[Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})]\x1b[0m\r\n`);
        setTimeout(connect, 1000 * reconnectAttempts);
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        terminal?.write('\r\n\x1b[31m[Connection lost. Click to reconnect.]\x1b[0m\r\n');
      }
    };

    ws.onerror = (err) => {
      console.error('[Terminal] WebSocket error:', err);
    };
  }

  async function initTerminal() {
    if (!terminalRef || terminal || !browser) return;

    // Ensure modules are loaded
    await loadModules();
    if (!TerminalClass || !FitAddonClass) return;

    terminal = new TerminalClass({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 5000,
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#f8f8f2',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#44475a',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
    });

    fitAddon = new FitAddonClass();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef);

    // Ensure the helper textarea is enabled for input
    const helpers = terminalRef?.querySelectorAll('.xterm-helper-textarea');
    helpers?.forEach((el: Element) => el.removeAttribute('disabled'));

    // Focus terminal after setup
    setTimeout(() => terminal?.focus(), 100);

    // Fit after a brief delay to ensure container is sized
    setTimeout(() => {
      fitAddon?.fit();
    }, 50);

    // Send input to WebSocket
    terminal.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Initial message
    terminal.write('Connecting to terminal...\r\n');

    // Connect to WebSocket
    connect();
  }

  function handleResize() {
    if (fitAddon && visible) {
      fitAddon.fit();
    }
  }

  // Keepalive ping every 30 seconds
  let pingInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    if (visible) {
      initTerminal();
    }

    window.addEventListener('resize', handleResize);

    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    clearInterval(pingInterval);

    if (ws) {
      ws.close();
    }
    if (terminal) {
      terminal.dispose();
    }
  });

  // React to visibility changes
  $: if (visible && terminalRef && !terminal) {
    initTerminal();
  }

  $: if (visible && fitAddon) {
    setTimeout(() => fitAddon?.fit(), 50);
  }

  function handleTerminalClick() {
    // Always focus terminal on click
    terminal?.focus();

    // If disconnected and not currently reconnecting, try to connect
    if (!connected && !reconnecting) {
      terminal?.clear();
      terminal?.write('Reconnecting...\r\n');
      reconnectAttempts = 0;
      connect();
    }
  }

  async function restartSession() {
    // Kill the tmux session and reconnect fresh
    if (ws) {
      ws.close();
    }
    terminal?.clear();
    terminal?.write('Restarting session...\r\n');

    // Kill tmux session via API
    try {
      await fetch(`/api/terminal/kill?session=${encodeURIComponent(sessionName)}`, { method: 'POST' });
    } catch (e) {
      // Ignore errors
    }

    // Wait a moment then reconnect
    setTimeout(() => {
      sessionName = '';
      reconnectAttempts = 0;
      connect();
    }, 500);
  }
</script>

<div class="terminal-container" class:hidden={!visible}>
  <div class="terminal-header">
    <div class="terminal-title">
      <span class="terminal-icon">📟</span>
      Terminal
      {#if sessionName}
        <button class="session-name-btn" on:click={() => { loadSessions(); showSessionSelector = !showSessionSelector; }}>
          {sessionName} ▾
        </button>
      {/if}
    </div>
    <div class="terminal-controls">
      <button class="terminal-btn" on:click={restartSession} title="Restart session">
        🔄
      </button>
      <button class="terminal-btn" on:click={() => { loadSessions(); showSessionSelector = !showSessionSelector; }} title="Switch session">
        📋
      </button>
      <div class="terminal-status" class:connected>
        {connected ? '● Connected' : '○ Disconnected'}
      </div>
    </div>

    <!-- Session Selector Dropdown -->
    {#if showSessionSelector}
      <div class="session-dropdown">
        <div class="session-dropdown-header">
          <span>Available Sessions</span>
          <button class="session-close" on:click={() => showSessionSelector = false}>×</button>
        </div>
        {#if loadingSessions}
          <div class="session-loading">Loading...</div>
        {:else if availableSessions.length === 0}
          <div class="session-empty">No active sessions</div>
        {:else}
          <ul class="session-list">
            {#each availableSessions as session}
              <li>
                <button
                  class="session-item"
                  class:active={session.name === sessionName}
                  on:click={() => switchSession(session)}
                >
                  <span class="session-item-name">{session.name}</span>
                  <span class="session-item-meta">
                    {session.windows} window{session.windows !== 1 ? 's' : ''}
                    {#if session.attached}
                      <span class="session-attached">●</span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="terminal-body" bind:this={terminalRef} on:click={handleTerminalClick}></div>
</div>

<style>
  .terminal-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 100%;
    background: #1a1a2e;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #333;
    position: relative;
    clip-path: inset(0);
  }

  .terminal-container.hidden {
    display: none;
  }

  .terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #16162a;
    border-bottom: 1px solid #333;
    position: relative;
  }

  .terminal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #eaeaea;
    font-weight: 500;
  }

  .terminal-icon {
    font-size: 14px;
  }

  .session-name-btn {
    font-size: 11px;
    color: #888;
    font-weight: normal;
    background: none;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .session-name-btn:hover {
    background: #333;
    color: #eaeaea;
  }

  .terminal-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .terminal-btn {
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }

  .terminal-btn:hover {
    opacity: 1;
    background: #333;
  }

  .terminal-status {
    font-size: 11px;
    color: #888;
  }

  .terminal-status.connected {
    color: #50fa7b;
  }

  /* Session Dropdown */
  .session-dropdown {
    position: absolute;
    top: 100%;
    right: 12px;
    width: 280px;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 100;
    margin-top: 4px;
  }

  .session-dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid #333;
    font-size: 12px;
    font-weight: 500;
    color: #eaeaea;
  }

  .session-close {
    background: none;
    border: none;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .session-close:hover {
    color: #eaeaea;
  }

  .session-loading,
  .session-empty {
    padding: 16px;
    text-align: center;
    color: #888;
    font-size: 12px;
  }

  .session-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
  }

  .session-item {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    color: #eaeaea;
    font-size: 12px;
    transition: background 0.15s ease;
  }

  .session-item:hover {
    background: #333;
  }

  .session-item.active {
    background: #2d2d5a;
  }

  .session-item-name {
    font-weight: 500;
  }

  .session-item-meta {
    font-size: 10px;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .session-attached {
    color: #50fa7b;
  }

  .terminal-body {
    flex: 1;
    padding: 4px;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  /* xterm.js overrides */
  .terminal-body :global(.xterm) {
    height: 100%;
    width: 100%;
  }

  .terminal-body :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .terminal-body :global(.xterm-screen) {
    width: 100%;
  }
</style>
