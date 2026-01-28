<script lang="ts">
  import { onMount } from 'svelte';

  let loaded = false;
  let loadingText = 'LOADING WORKFLOW.EXE';

  onMount(() => {
    const messages = [
      'LOADING WORKFLOW.EXE',
      'INITIALIZING SPEC...',
      'SYNCING WITH AI...',
      'READY.'
    ];
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < messages.length) {
        loadingText = messages[i];
      } else {
        clearInterval(interval);
        loaded = true;
      }
    }, 400);
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>chkd — Spec-driven workflow for AI agents</title>
  <meta name="description" content="Coordinate multiple AI agents with one shared spec. Total visibility, zero chaos." />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

{#if !loaded}
  <div class="loading-screen">
    <div class="loading-window">
      <div class="window-title">
        <span class="dots">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </span>
        chkd.exe
      </div>
      <div class="loading-content">
        <div class="loading-icon">█✓█</div>
        <div class="loading-text">{loadingText}</div>
        <div class="loading-bar">
          <div class="loading-fill"></div>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="landing">
    <!-- Nav -->
    <nav>
      <a href="/" class="brand">
        <span class="logo">█✓█</span>
        <span class="name">chkd™</span>
      </a>
      <div class="nav-links">
        <a href="/guide">Docs</a>
        <a href="https://github.com/your/chkd" class="nav-link">GitHub</a>
        <a href="/" class="btn-primary">Get Started</a>
      </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
      <div class="hero-content-full">
        <div class="hero-ascii">█✓█ chkd</div>
        <p class="hero-eyebrow">Spec-driven workflow for AI agents</p>
        <h1>AI builds fast.<br/><span class="highlight">You need to keep up.</span></h1>
        <p class="hero-sub">
          A shared spec that you and AI both follow.<br/>
          One file. Multiple agents. Total clarity.
        </p>
        <div class="hero-cta">
          <a href="/guide" class="btn-primary btn-large">Start Building →</a>
          <a href="#how" class="btn-secondary">See how it works</a>
        </div>
        <p class="hero-note">Works with Claude Code. Free & open source.</p>
      </div>
      <div class="hero-visual">
        <div class="hero-window">
          <div class="window-chrome dark">
            <span class="dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </span>
            <span class="window-title-text">chkd dashboard</span>
          </div>
          <div class="dashboard-preview">
            <div class="preview-repo">
              <div class="repo-header">
                <span class="repo-icon">📁</span>
                <span class="repo-name">my-app</span>
                <span class="repo-progress">67%</span>
              </div>
              <div class="repo-bar"><div class="repo-fill" style="width: 67%"></div></div>
              <div class="repo-current">Current: <strong>FE.3 Settings page</strong></div>
              <div class="repo-workers">
                <span class="worker-badge working">Worker 1 · FE.11 · 80%</span>
                <span class="worker-badge merging">Worker 2 · BE.24 · Merging</span>
              </div>
            </div>
            <div class="preview-spec">
              <div class="spec-line done">✓ FE.1 Login page</div>
              <div class="spec-line done">✓ FE.2 Dashboard</div>
              <div class="spec-line active">~ FE.3 Settings page</div>
              <div class="spec-line pending">○ FE.4 User profile</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- The Problem -->
    <section class="problem">
      <h2>The real problem with AI coding</h2>
      <p class="problem-intro">It's not capability. It's alignment.</p>
      <div class="problem-grid">
        <div class="problem-card">
          <div class="problem-icon">◈</div>
          <h4>Context decay</h4>
          <p>Every session starts fresh. Your mental model carries over. AI's doesn't. You end up being the bottleneck — re-teaching what should be remembered.</p>
        </div>
        <div class="problem-card">
          <div class="problem-icon">◈</div>
          <h4>Velocity without direction</h4>
          <p>AI moves fast. Sometimes too fast. It optimizes for "done" when you need "right." By the time you notice, three features exist that nobody asked for.</p>
        </div>
        <div class="problem-card">
          <div class="problem-icon">◈</div>
          <h4>The verification gap</h4>
          <p>You can't verify what you don't track. Small issues become big problems because there's no system to catch them — just your memory, which is already overloaded.</p>
        </div>
        <div class="problem-card">
          <div class="problem-icon">◈</div>
          <h4>Cognitive load asymmetry</h4>
          <p>AI handles the code. You handle everything else — context, decisions, verification, course correction. Without structure, that load compounds.</p>
        </div>
        <div class="problem-card full-width">
          <div class="problem-icon">◈</div>
          <h4>Multi-agent chaos</h4>
          <p>One agent is manageable. But real work needs multiple agents — one researching, one building, one reviewing. Without coordination, they duplicate work, contradict each other, and create merge nightmares. You become the traffic controller instead of the decision maker.</p>
        </div>
      </div>
    </section>

    <!-- The Solution -->
    <section class="solution">
      <div class="solution-window">
        <div class="window-chrome">
          <span class="dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </span>
          <span class="window-title-text">chkd — Your shared brain</span>
        </div>
        <div class="solution-content">
          <div class="solution-text">
            <h2>A database keeps you both aligned</h2>
            <p>
              chkd tracks tasks in a database that you and AI both access.
              You see progress. AI knows exactly where to focus.
            </p>
            <p>
              <strong>You</strong> declare what you're building.<br/>
              <strong>AI</strong> knows exactly what to focus on.<br/>
              <strong>Together</strong> you verify each step before moving on.
            </p>
            <p class="solution-benefit">
              Tomorrow, you pick up exactly where you left off.
            </p>
          </div>
          <div class="solution-demo">
            <pre class="spec-preview">{`chkd status

📋 In Progress
  ~  SD.1 User auth system
     ✓  Design login flow
     ✓  Create auth API
     ○  Add password reset  ← You are here
     ○  Write tests

🐛 Bugs
  ○  BUG-1: Login fails on Safari

📝 Up Next
  ○  SD.2 Dashboard layout
  ○  SD.3 Settings page`}</pre>
          </div>
        </div>
      </div>
    </section>

    <!-- No magic -->
    <section class="simple">
      <div class="simple-badge">No magic</div>
      <h2>It's just markdown</h2>
      <p class="simple-sub">
        No complex config. No vendor lock-in.<br/>
        A local database at <code>~/.chkd/</code> that you and AI both access.
      </p>

      <div class="simple-grid">
        <div class="simple-card">
          <div class="simple-icon">📄</div>
          <h3>Human readable</h3>
          <p>Open it in any editor. It's just text. No proprietary format.</p>
        </div>
        <div class="simple-card">
          <div class="simple-icon">✏️</div>
          <h3>Human editable</h3>
          <p>Edit it yourself anytime. Reorder tasks. Add notes. It's your file.</p>
        </div>
        <div class="simple-card">
          <div class="simple-icon">🤖</div>
          <h3>AI readable</h3>
          <p>Claude reads the same file you do. Total transparency. No black box.</p>
        </div>
      </div>

      <p class="simple-note">
        Want to change your workflow? Just edit the markdown. That's it.
      </p>
    </section>

    <!-- Who it's for -->
    <section class="who">
      <h2>Built for</h2>
      <div class="who-grid">
        <div class="who-card">
          <div class="who-icon">🚀</div>
          <h3>Solo builders</h3>
          <p>Building your startup or side project with AI. Need to stay focused and ship.</p>
        </div>
        <div class="who-card">
          <div class="who-icon">💡</div>
          <h3>Non-technical founders</h3>
          <p>Using AI to build without deep coding skills. Want structure without overhead.</p>
        </div>
        <div class="who-card">
          <div class="who-icon">⚡</div>
          <h3>Developers</h3>
          <p>Tired of re-explaining your workflow to Claude. Want AI to remember your patterns.</p>
        </div>
        <div class="who-card">
          <div class="who-icon">👥</div>
          <h3>Small teams</h3>
          <p>2-5 people shipping together. Need a shared spec everyone (including AI) can follow.</p>
        </div>
      </div>
    </section>

    <!-- Flexibility -->
    <section class="flexible">
      <div class="flexible-content">
        <div class="flexible-text">
          <h2>Use Claude freely. Add structure when ready.</h2>
          <p>
            chkd doesn't lock you in. Use Claude to research your codebase,
            brainstorm ideas, explore possibilities — no spec needed.
          </p>
          <p>
            Then when you're ready to build? Just add it to the spec and go.
          </p>
          <div class="flexible-flow">
            <span class="flow-tag explore">Explore freely</span>
            <span class="flow-arrow">→</span>
            <span class="flow-tag decide">Decide what to build</span>
            <span class="flow-arrow">→</span>
            <span class="flow-tag build">Add to spec & build</span>
          </div>
        </div>
        <div class="flexible-example">
          <div class="chat-bubble user">
            <span class="chat-label">You</span>
            "What's the best way to handle auth in this codebase?"
          </div>
          <div class="chat-bubble ai">
            <span class="chat-label">Claude</span>
            "Looking at your existing patterns, I'd suggest..."
          </div>
          <div class="chat-bubble user">
            <span class="chat-label">You</span>
            "OK let's do it. Add it to the spec."
          </div>
          <div class="chat-bubble ai">
            <span class="chat-label">Claude</span>
            <code>chkd add "Auth system" --story "JWT-based auth..."</code>
          </div>
        </div>
      </div>
    </section>

    <!-- Not Automation -->
    <section class="partnership">
      <div class="partnership-badge">Honest truth</div>
      <h2>This is NOT autopilot</h2>
      <p class="partnership-sub">
        chkd is a contract between you and AI. Not automation. Not "set and forget."
      </p>

      <div class="partnership-grid">
        <div class="partnership-card">
          <div class="partnership-header">
            <span class="partnership-icon">🤝</span>
            <h3>A contract, not a cage</h3>
          </div>
          <p>Both parties agree to work a certain way. Neither is forced. Both benefit. The flexibility is the feature.</p>
        </div>

        <div class="partnership-card">
          <div class="partnership-header">
            <span class="partnership-icon">👀</span>
            <h3>You stay engaged</h3>
          </div>
          <p>Expect to guide AI when it drifts. "Use this tool." "Focus on that." "Try it this way." Your intellect matters.</p>
        </div>

        <div class="partnership-card">
          <div class="partnership-header">
            <span class="partnership-icon">⚖️</span>
            <h3>Imperfect by design</h3>
          </div>
          <p>We could make it rigid and foolproof. But rigid = unenjoyable. The trade-off for flexibility is you stay involved.</p>
        </div>

        <div class="partnership-card">
          <div class="partnership-header">
            <span class="partnership-icon">🎯</span>
            <h3>Collaborative, not hands-off</h3>
          </div>
          <p>If you want AI as a capable partner you work WITH (not watch from afar), this is it.</p>
        </div>
      </div>

      <div class="partnership-quote">
        <p>"AI drifts. <em>You</em> drift too. That's human nature. <strong>chkd keeps both of you structured</strong> — forced checkpoints where you realign, verify, then continue. Neither party can skip it."</p>
      </div>
    </section>

    <!-- How it works -->
    <section class="how">
      <h2>The workflow</h2>
      <p class="how-intro">You probably already do this. chkd just makes it stick.</p>

      <div class="workflow-diagram">
        <div class="workflow-step">
          <div class="step-number">1</div>
          <div class="step-label">DECLARE</div>
          <div class="step-desc">Say what you're building</div>
          <code>chkd working "auth flow"</code>
        </div>
        <div class="workflow-arrow">→</div>
        <div class="workflow-step">
          <div class="step-number">2</div>
          <div class="step-label">BUILD</div>
          <div class="step-desc">AI helps, you guide</div>
          <code>AI stays focused on auth</code>
        </div>
        <div class="workflow-arrow">→</div>
        <div class="workflow-step">
          <div class="step-number">3</div>
          <div class="step-label">VERIFY</div>
          <div class="step-desc">Is it right? Tick it off</div>
          <code>chkd tick</code>
        </div>
        <div class="workflow-arrow">↩</div>
        <div class="workflow-step repeat">
          <div class="step-label">REPEAT</div>
        </div>
      </div>
    </section>

    <!-- Multi-Worker -->
    <section class="multiworker">
      <div class="multiworker-badge">Key capability</div>
      <h2>Coordinate multiple agents</h2>
      <p class="multiworker-sub">One manager. Multiple workers. Zero chaos.</p>

      <div class="multiworker-visual">
        <div class="mw-diagram">
          <div class="mw-manager">
            <div class="mw-label">MANAGER</div>
            <div class="mw-desc">You + Claude</div>
          </div>
          <div class="mw-lines">
            <div class="mw-line"></div>
            <div class="mw-line"></div>
            <div class="mw-line"></div>
          </div>
          <div class="mw-workers">
            <div class="mw-worker">
              <div class="mw-worker-task">FE.11</div>
              <div class="mw-worker-progress"><div class="mw-fill" style="width: 80%"></div></div>
              <div class="mw-worker-status">80%</div>
            </div>
            <div class="mw-worker">
              <div class="mw-worker-task">BE.24</div>
              <div class="mw-worker-progress"><div class="mw-fill" style="width: 45%"></div></div>
              <div class="mw-worker-status">45%</div>
            </div>
            <div class="mw-worker">
              <div class="mw-worker-task">SD.28</div>
              <div class="mw-worker-progress"><div class="mw-fill" style="width: 15%"></div></div>
              <div class="mw-worker-status">15%</div>
            </div>
          </div>
        </div>
        <div class="mw-features">
          <div class="mw-feature">
            <span class="mw-icon">🌿</span>
            <span>Separate branches per worker</span>
          </div>
          <div class="mw-feature">
            <span class="mw-icon">🔄</span>
            <span>Automatic merge coordination</span>
          </div>
          <div class="mw-feature">
            <span class="mw-icon">👁</span>
            <span>Full visibility in dashboard</span>
          </div>
          <div class="mw-feature">
            <span class="mw-icon">⚡</span>
            <span>3x faster parallel building</span>
          </div>
        </div>
      </div>

      <div class="mw-commands">
        <code>spawn_worker("FE.11")</code>
        <span class="mw-arrow">→</span>
        <code>workers()</code>
        <span class="mw-arrow">→</span>
        <code>merge_worker(id)</code>
      </div>
    </section>

    <!-- MCP & Commands -->
    <section class="commands">
      <div class="mcp-banner">
        <div class="mcp-icon">⚡</div>
        <div class="mcp-text">
          <h3>It's an MCP server</h3>
          <p>Claude Code uses chkd tools directly. No copy-paste. No context switching.</p>
        </div>
      </div>

      <h2>The tools</h2>
      <p class="commands-intro">Use from terminal or let Claude call them directly via MCP.</p>

      <div class="commands-grid">
        <div class="cmd-category">
          <div class="cmd-header">
            <span class="cmd-icon">🔧</span>
            <h4>Core Workflow</h4>
          </div>
          <div class="cmd-list">
            <div class="cmd"><code>status</code> <span>See current state</span></div>
            <div class="cmd"><code>add</code> <span>Add a feature</span></div>
            <div class="cmd"><code>working</code> <span>Start a task</span></div>
            <div class="cmd"><code>tick</code> <span>Mark complete</span></div>
            <div class="cmd"><code>suggest</code> <span>What's next?</span></div>
          </div>
        </div>

        <div class="cmd-category">
          <div class="cmd-header">
            <span class="cmd-icon">🎯</span>
            <h4>Sessions</h4>
          </div>
          <div class="cmd-list">
            <div class="cmd"><code>impromptu</code> <span>Ad-hoc work</span></div>
            <div class="cmd"><code>debug</code> <span>Investigation</span></div>
            <div class="cmd"><code>pivot</code> <span>Change focus</span></div>
            <div class="cmd"><code>pulse</code> <span>Quick update</span></div>
            <div class="cmd"><code>done</code> <span>End session</span></div>
          </div>
        </div>

        <div class="cmd-category">
          <div class="cmd-header">
            <span class="cmd-icon">🐛</span>
            <h4>Bugs</h4>
          </div>
          <div class="cmd-list">
            <div class="cmd"><code>bug</code> <span>Log a bug</span></div>
            <div class="cmd"><code>bugs</code> <span>List all bugs</span></div>
            <div class="cmd"><code>bugfix</code> <span>Start fixing</span></div>
            <div class="cmd"><code>fix</code> <span>Ready to verify</span></div>
            <div class="cmd"><code>resolve</code> <span>Close bug</span></div>
          </div>
        </div>

        <div class="cmd-category">
          <div class="cmd-header">
            <span class="cmd-icon">✨</span>
            <h4>Quick Wins</h4>
          </div>
          <div class="cmd-list">
            <div class="cmd"><code>win</code> <span>Add quick win</span></div>
            <div class="cmd"><code>wins</code> <span>List all</span></div>
            <div class="cmd"><code>won</code> <span>Mark done</span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Getting started -->
    <section class="start">
      <h2>Start in 60 seconds</h2>
      <div class="start-steps">
        <div class="start-step">
          <span class="start-num">1</span>
          <code>npx chkd init</code>
          <p>Sets up chkd in your project</p>
        </div>
        <div class="start-step">
          <span class="start-num">2</span>
          <code>chkd add "Your first feature"</code>
          <p>Add what you're building</p>
        </div>
        <div class="start-step">
          <span class="start-num">3</span>
          <p class="start-go">Start building with AI. It reads your spec.</p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta">
      <div class="cta-window">
        <div class="window-chrome">
          <span class="dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </span>
        </div>
        <div class="cta-content">
          <h2>Ready to stop repeating yourself?</h2>
          <p>Free. Open source. Works with Claude Code.</p>
          <div class="cta-code">
            <code>npx chkd init</code>
          </div>
          <a href="/guide" class="btn-ghost">Read the docs →</a>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer>
      <div class="footer-content">
        <span class="logo">█✓█</span>
        <span>chkd™ — A workflow for building with AI</span>
      </div>
      <div class="footer-links">
        <a href="/guide">Docs</a>
        <a href="https://github.com/your/chkd">GitHub</a>
      </div>
    </footer>
  </div>
{/if}

<style>
  :root {
    --bg: #0a0a0f;
    --bg-light: #12121a;
    --bg-window: #1a1a24;
    --coral: #e8956a;
    --coral-bright: #f4a77d;
    --coral-dim: rgba(232, 149, 106, 0.12);
    --teal: #00d4aa;
    --teal-dim: rgba(0, 212, 170, 0.12);
    --yellow: #ffd93d;
    --text: #f0f0f5;
    --text-muted: #7a7a8c;
    --border: #2a2a3a;
    --font-display: 'JetBrains Mono', monospace;
    --font-heading: 'Space Grotesk', -apple-system, sans-serif;
    --font-body: 'Space Grotesk', -apple-system, sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* Loading Screen */
  .loading-screen {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-window {
    background: var(--bg-window);
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    width: 320px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .window-title {
    background: var(--bg-light);
    padding: 12px 16px;
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
  }

  .dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .dot.red { background: #ff5f57; }
  .dot.yellow { background: #ffbd2e; }
  .dot.green { background: #28ca42; }

  .loading-content {
    padding: 40px;
    text-align: center;
  }

  .loading-icon {
    font-family: var(--font-display);
    font-size: 32px;
    color: var(--teal);
    margin-bottom: 20px;
  }

  .loading-text {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--teal);
    margin-bottom: 20px;
  }

  .loading-bar {
    height: 4px;
    background: var(--bg);
    border-radius: 2px;
    overflow: hidden;
  }

  .loading-fill {
    height: 100%;
    background: var(--teal);
    animation: load 1.6s ease-in-out;
  }

  @keyframes load {
    0% { width: 0%; }
    100% { width: 100%; }
  }

  /* Main Landing */
  .landing {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    line-height: 1.6;
  }

  /* Nav */
  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 40px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--text);
  }

  .logo {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--teal);
  }

  .name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 18px;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .nav-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s;
  }

  .nav-links a:hover { color: var(--text); }

  .btn-primary {
    background: var(--teal);
    color: var(--bg);
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 212, 170, 0.3);
  }

  .btn-large {
    padding: 14px 28px;
    font-size: 16px;
  }

  .btn-ghost {
    color: var(--teal);
    text-decoration: none;
    font-size: 14px;
    transition: opacity 0.2s;
  }

  .btn-ghost:hover { opacity: 0.8; }

  /* Sections */
  section {
    max-width: 1000px;
    margin: 0 auto;
    padding: 80px 40px;
  }

  h2 {
    font-family: var(--font-heading);
    font-size: 40px;
    font-weight: 700;
    margin-bottom: 24px;
    color: var(--text);
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  /* Hero */
  .hero {
    padding: 80px 40px 100px;
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: 60px;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
  }

  .hero-content-full {
    text-align: left;
  }

  .hero-visual {
    position: relative;
  }

  .hero-window {
    background: var(--bg-window);
    border: 2px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 80px rgba(0, 212, 170, 0.15);
  }

  .window-chrome {
    background: var(--bg-light);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--border);
  }

  .window-chrome.dark {
    background: #0d0d0d;
  }

  .window-title-text {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--text-muted);
  }

  .dashboard-preview {
    padding: 24px;
    background: var(--bg);
  }

  .preview-repo {
    background: var(--bg-light);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
  }

  .repo-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .repo-icon { font-size: 18px; }
  .repo-name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    flex: 1;
  }
  .repo-progress {
    font-family: var(--font-display);
    color: var(--teal);
    font-size: 14px;
  }

  .repo-bar {
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .repo-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--teal), var(--coral));
    border-radius: 3px;
    transition: width 1s ease;
  }

  .repo-current {
    font-size: 14px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .repo-current strong { color: var(--text); }

  .repo-workers {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .worker-badge {
    font-family: var(--font-display);
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--bg);
  }

  .worker-badge.working {
    border: 1px solid var(--teal);
    color: var(--teal);
  }

  .worker-badge.merging {
    border: 1px solid var(--coral);
    color: var(--coral);
  }

  .preview-spec {
    font-family: var(--font-display);
    font-size: 13px;
  }

  .spec-line {
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 4px;
  }

  .spec-line.done { color: var(--teal); opacity: 0.7; }
  .spec-line.active {
    color: var(--coral);
    background: rgba(229, 154, 123, 0.1);
    border-left: 3px solid var(--coral);
  }
  .spec-line.pending { color: var(--text-muted); }

  .hero-ascii {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 800;
    color: var(--coral-bright);
    margin-bottom: 24px;
    letter-spacing: 0.05em;
  }

  .hero-eyebrow {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 3px;
    margin-bottom: 16px;
  }

  .hero h1 {
    font-family: var(--font-heading);
    font-size: 56px;
    font-weight: 700;
    margin-bottom: 24px;
    line-height: 1.1;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .highlight {
    color: var(--coral-bright);
  }

  .hero-sub {
    font-size: 20px;
    color: var(--text-muted);
    margin-bottom: 32px;
    line-height: 1.6;
  }

  .hero-sub strong {
    color: var(--text);
  }

  .hero-cta {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }

  .btn-secondary {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 16px;
    padding: 14px 24px;
    border: 1px solid var(--border);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    color: var(--text);
    border-color: var(--text-muted);
  }

  .hero-note {
    font-size: 14px;
    color: var(--text-muted);
  }

  /* Problem */
  .problem {
    text-align: center;
  }

  .problem-intro {
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--coral-bright);
    margin-bottom: 48px;
    letter-spacing: 0.5px;
  }

  .problem-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    margin-top: 40px;
  }

  .problem-card {
    background: var(--bg-light);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 32px;
    text-align: left;
    transition: border-color 0.2s, transform 0.2s;
  }

  .problem-card:hover {
    border-color: var(--coral);
    transform: translateY(-2px);
  }

  .problem-icon {
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--coral);
    margin-bottom: 12px;
  }

  .problem-card h4 {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .problem-card p {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.7;
  }

  .problem-card.full-width {
    grid-column: 1 / -1;
    background: linear-gradient(135deg, var(--bg-light) 0%, rgba(229, 154, 123, 0.05) 100%);
    border-color: var(--coral);
  }

  /* Solution */
  .solution-window {
    background: var(--bg-window);
    border: 2px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
  }

  .solution-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    padding: 40px;
  }

  .solution-text h2 {
    font-size: 24px;
    margin-bottom: 20px;
  }

  .solution-text p {
    color: var(--text-muted);
    margin-bottom: 16px;
    line-height: 1.7;
  }

  .solution-text strong {
    color: var(--teal);
  }

  .solution-benefit {
    color: var(--text) !important;
    font-weight: 500;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .spec-preview {
    font-family: var(--font-display);
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    overflow-x: auto;
  }

  /* Simple/No Magic */
  .simple {
    text-align: center;
    background: var(--bg-light);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    max-width: none;
    padding: 80px 40px;
  }

  .simple-badge {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--teal);
    background: var(--teal-dim);
    border: 1px solid var(--teal);
    padding: 6px 16px;
    border-radius: 20px;
    margin-bottom: 20px;
  }

  .simple h2 {
    font-size: 36px;
  }

  .simple-sub {
    font-size: 18px;
    color: var(--text-muted);
    max-width: 500px;
    margin: 0 auto 48px;
    line-height: 1.7;
  }

  .simple-sub code {
    font-family: var(--font-display);
    color: var(--teal);
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .simple-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 900px;
    margin: 0 auto;
  }

  .simple-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
  }

  .simple-icon {
    font-size: 36px;
    margin-bottom: 16px;
  }

  .simple-card h3 {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--text);
  }

  .simple-card p {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .simple-note {
    margin-top: 40px;
    font-size: 15px;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Who */
  .who {
    text-align: center;
  }

  .who-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-top: 40px;
  }

  .who-card {
    background: var(--bg-light);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    transition: border-color 0.2s, transform 0.2s;
  }

  .who-card:hover {
    border-color: var(--teal);
    transform: translateY(-4px);
  }

  .who-icon {
    font-size: 32px;
    margin-bottom: 16px;
  }

  .who-card h3 {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--text);
  }

  .who-card p {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* Flexible */
  .flexible {
    background: var(--bg-window);
    border: 2px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
  }

  .flexible-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    padding: 48px;
  }

  .flexible-text h2 {
    font-size: 24px;
    margin-bottom: 20px;
    line-height: 1.3;
  }

  .flexible-text p {
    color: var(--text-muted);
    margin-bottom: 16px;
    line-height: 1.7;
  }

  .flexible-flow {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 24px;
    flex-wrap: wrap;
  }

  .flow-tag {
    font-family: var(--font-display);
    font-size: 12px;
    padding: 8px 14px;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .flow-tag.explore {
    border-color: #6b7280;
    color: #9ca3af;
  }

  .flow-tag.decide {
    border-color: var(--yellow);
    color: var(--yellow);
    background: rgba(255, 217, 61, 0.1);
  }

  .flow-tag.build {
    border-color: var(--teal);
    color: var(--teal);
    background: var(--teal-dim);
  }

  .flow-arrow {
    color: var(--text-muted);
    font-size: 14px;
  }

  .flexible-example {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .chat-bubble {
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    position: relative;
  }

  .chat-bubble.user {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    align-self: flex-end;
    max-width: 90%;
    margin-left: auto;
  }

  .chat-bubble.ai {
    background: var(--teal-dim);
    border: 1px solid rgba(0, 212, 170, 0.3);
    color: var(--text-muted);
    max-width: 90%;
  }

  .chat-label {
    display: block;
    font-family: var(--font-display);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .chat-bubble.ai .chat-label {
    color: var(--teal);
  }

  .chat-bubble code {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--teal);
    background: var(--bg);
    padding: 4px 8px;
    border-radius: 4px;
    display: block;
    margin-top: 4px;
  }

  /* Partnership / Not Automation */
  .partnership {
    text-align: center;
    background: linear-gradient(180deg, var(--bg) 0%, var(--bg-light) 100%);
    border-top: 1px solid var(--border);
    max-width: none;
    padding: 80px 40px;
  }

  .partnership-badge {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--coral);
    background: var(--coral-dim);
    border: 1px solid var(--coral);
    padding: 6px 16px;
    border-radius: 20px;
    margin-bottom: 20px;
  }

  .partnership h2 {
    font-size: 36px;
  }

  .partnership-sub {
    font-size: 18px;
    color: var(--text-muted);
    max-width: 500px;
    margin: 0 auto 48px;
    line-height: 1.7;
  }

  .partnership-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    max-width: 1000px;
    margin: 0 auto 40px;
  }

  .partnership-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    text-align: left;
    transition: border-color 0.2s;
  }

  .partnership-card:hover {
    border-color: var(--coral);
  }

  .partnership-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .partnership-icon {
    font-size: 20px;
  }

  .partnership-card h3 {
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 700;
    color: var(--coral-bright);
  }

  .partnership-card p {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .partnership-quote {
    background: var(--bg-window);
    border: 1px solid var(--border);
    border-left: 3px solid var(--coral);
    border-radius: 8px;
    padding: 24px 32px;
    max-width: 700px;
    margin: 0 auto;
    text-align: left;
  }

  .partnership-quote p {
    font-size: 15px;
    color: var(--text-muted);
    line-height: 1.7;
    font-style: italic;
  }

  .partnership-quote strong {
    color: var(--coral-bright);
    font-style: normal;
  }

  /* How */
  .how {
    text-align: center;
  }

  .how-intro {
    color: var(--text-muted);
    margin-bottom: 48px;
  }

  .workflow-diagram {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .workflow-step {
    background: var(--bg-light);
    border: 2px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    min-width: 160px;
    text-align: center;
  }

  .workflow-step.repeat {
    background: var(--teal-dim);
    border-color: var(--teal);
    min-width: auto;
    padding: 16px 24px;
  }

  .step-number {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--teal);
    margin-bottom: 8px;
  }

  .step-label {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .step-desc {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .workflow-step code {
    font-family: var(--font-display);
    font-size: 11px;
    color: var(--teal);
    background: var(--bg);
    padding: 6px 10px;
    border-radius: 4px;
    display: block;
  }

  .workflow-arrow {
    font-family: var(--font-display);
    font-size: 24px;
    color: var(--teal);
  }

  /* Multi-Worker */
  .multiworker {
    text-align: center;
    background: linear-gradient(180deg, var(--bg-light) 0%, var(--bg) 100%);
    border-top: 1px solid var(--border);
    max-width: none;
    padding: 80px 40px;
  }

  .multiworker-badge {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--teal);
    background: var(--teal-dim);
    border: 1px solid var(--teal);
    padding: 6px 16px;
    border-radius: 20px;
    margin-bottom: 20px;
  }

  .multiworker h2 {
    font-size: 36px;
  }

  .multiworker-sub {
    font-size: 18px;
    color: var(--text-muted);
    margin-bottom: 48px;
  }

  .multiworker-visual {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 40px;
    max-width: 900px;
    margin: 0 auto 40px;
    align-items: center;
  }

  .mw-diagram {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
  }

  .mw-manager {
    background: var(--teal-dim);
    border: 2px solid var(--teal);
    border-radius: 12px;
    padding: 16px 24px;
    margin-bottom: 24px;
  }

  .mw-label {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    color: var(--teal);
    margin-bottom: 4px;
  }

  .mw-desc {
    font-size: 13px;
    color: var(--text-muted);
  }

  .mw-lines {
    display: flex;
    justify-content: space-around;
    margin-bottom: 16px;
  }

  .mw-line {
    width: 2px;
    height: 24px;
    background: linear-gradient(180deg, var(--teal), var(--border));
  }

  .mw-workers {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .mw-worker {
    background: var(--bg-light);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    min-width: 100px;
    text-align: center;
  }

  .mw-worker-task {
    font-family: var(--font-display);
    font-size: 13px;
    color: var(--coral-bright);
    margin-bottom: 8px;
  }

  .mw-worker-progress {
    height: 4px;
    background: var(--bg);
    border-radius: 2px;
    margin-bottom: 6px;
    overflow: hidden;
  }

  .mw-fill {
    height: 100%;
    background: var(--teal);
    border-radius: 2px;
  }

  .mw-worker-status {
    font-family: var(--font-display);
    font-size: 11px;
    color: var(--text-muted);
  }

  .mw-features {
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-align: left;
  }

  .mw-feature {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 15px;
    color: var(--text);
  }

  .mw-icon {
    font-size: 20px;
  }

  .mw-commands {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .mw-commands code {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--teal);
    background: var(--bg-light);
    padding: 12px 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .mw-arrow {
    color: var(--text-muted);
    font-size: 18px;
  }

  /* Commands */
  .commands {
    text-align: center;
  }

  .mcp-banner {
    display: flex;
    align-items: center;
    gap: 20px;
    background: linear-gradient(135deg, var(--coral-dim) 0%, rgba(0, 212, 170, 0.08) 100%);
    border: 2px solid var(--coral);
    border-radius: 12px;
    padding: 24px 32px;
    margin-bottom: 48px;
    text-align: left;
  }

  .mcp-icon {
    font-size: 32px;
    background: var(--coral);
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mcp-text h3 {
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--coral-bright);
    margin-bottom: 4px;
  }

  .mcp-text p {
    color: var(--text-muted);
    font-size: 15px;
  }

  .commands-intro {
    color: var(--text-muted);
    margin-bottom: 32px;
  }

  .commands-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-top: 24px;
  }

  .cmd-category {
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    overflow: hidden;
    text-align: left;
  }

  .cmd-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    background: #151515;
    border-bottom: 1px solid #2a2a2a;
  }

  .cmd-icon {
    font-size: 18px;
  }

  .cmd-header h4 {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 700;
    color: var(--coral-bright);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cmd-list {
    padding: 12px;
  }

  .cmd {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .cmd:hover {
    background: #1a1a1a;
  }

  .cmd code {
    font-family: var(--font-display);
    font-size: 13px;
    color: var(--coral-bright);
  }

  .cmd span {
    font-size: 12px;
    color: #666;
  }

  /* Start */
  .start {
    text-align: center;
  }

  .start-steps {
    display: flex;
    justify-content: center;
    gap: 40px;
    margin-top: 48px;
  }

  .start-step {
    text-align: center;
  }

  .start-num {
    display: inline-block;
    width: 36px;
    height: 36px;
    line-height: 36px;
    background: var(--teal);
    color: var(--bg);
    font-family: var(--font-display);
    font-weight: 700;
    border-radius: 50%;
    margin-bottom: 16px;
  }

  .start-step code {
    display: block;
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--teal);
    background: var(--bg-light);
    padding: 12px 20px;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .start-step p {
    font-size: 14px;
    color: var(--text-muted);
  }

  .start-go {
    background: var(--teal-dim);
    border: 1px solid var(--teal);
    padding: 16px 24px;
    border-radius: 8px;
    color: var(--text) !important;
  }

  /* CTA */
  .cta {
    padding: 60px 40px 100px;
  }

  .cta-window {
    background: var(--bg-window);
    border: 2px solid var(--teal);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 80px rgba(0, 212, 170, 0.15);
  }

  .cta-content {
    padding: 60px;
    text-align: center;
  }

  .cta-content h2 {
    margin-bottom: 16px;
  }

  .cta-content p {
    color: var(--text-muted);
    margin-bottom: 32px;
  }

  .cta-code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 32px;
    display: inline-block;
    margin-bottom: 24px;
  }

  .cta-code code {
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--teal);
  }

  /* Footer */
  footer {
    border-top: 1px solid var(--border);
    padding: 32px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
  }

  .footer-content {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: var(--text-muted);
  }

  .footer-links {
    display: flex;
    gap: 24px;
  }

  .footer-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 14px;
  }

  .footer-links a:hover {
    color: var(--text);
  }

  /* Responsive */
  @media (max-width: 900px) {
    .hero {
      grid-template-columns: 1fr;
      padding: 60px 20px;
      gap: 40px;
    }

    .hero-content-full {
      text-align: center;
    }

    .hero-cta {
      justify-content: center;
      flex-wrap: wrap;
    }

    .hero h1 {
      font-size: 36px;
    }

    .problem-grid {
      grid-template-columns: 1fr;
    }

    .solution-content {
      grid-template-columns: 1fr;
    }

    .who-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .simple-grid {
      grid-template-columns: 1fr;
    }

    .simple h2 {
      font-size: 28px;
    }

    .partnership-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .partnership h2 {
      font-size: 28px;
    }

    .flexible-content {
      grid-template-columns: 1fr;
    }

    .flexible-text h2 {
      font-size: 22px;
    }

    .commands-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .mcp-banner {
      flex-direction: column;
      text-align: center;
    }

    .multiworker-visual {
      grid-template-columns: 1fr;
    }

    .mw-features {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      text-align: center;
    }

    .mw-workers {
      flex-direction: column;
      align-items: center;
    }

    .mw-commands {
      flex-direction: column;
    }

    .mw-arrow {
      transform: rotate(90deg);
    }

    .workflow-diagram {
      flex-direction: column;
    }

    .workflow-arrow {
      transform: rotate(90deg);
    }

    .start-steps {
      flex-direction: column;
      gap: 24px;
    }

    nav {
      padding: 16px 20px;
    }

    section {
      padding: 60px 20px;
    }
  }

  @media (max-width: 600px) {
    .who-grid {
      grid-template-columns: 1fr;
    }

    .commands-grid {
      grid-template-columns: 1fr;
    }

    .partnership-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
