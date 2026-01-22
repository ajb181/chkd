<script lang="ts">
  // Brand homepage for chkd
</script>

<svelte:head>
  <title>chkd - Development Workflow Tracker</title>
  <meta name="description" content="Keep Claude focused on planned work. Track tasks in a spec file, build systematically with a dashboard UI, CLI commands, and MCP tools." />
</svelte:head>

<div class="home">
  <header class="hero">
    <div class="hero-content">
      <h1 class="logo">chkd</h1>
      <p class="tagline">Keep Claude focused on planned work</p>
      <p class="description">
        A development workflow tool that tracks tasks in a spec file and helps Claude build them systematically.
        Dashboard UI, CLI commands, and MCP tools working together.
      </p>
      <div class="cta-buttons">
        <a href="/" class="btn btn-primary btn-lg">Open Dashboard</a>
        <a href="/guide" class="btn btn-secondary btn-lg">Read the Guide</a>
      </div>
    </div>
  </header>

  <section class="features">
    <h2>How it works</h2>
    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon">📋</div>
        <h3>Spec-Driven</h3>
        <p>Define features in <code>docs/SPEC.md</code>. Claude reads the spec and builds systematically, ticking items as they're completed.</p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🎯</div>
        <h3>Stay Focused</h3>
        <p>Anchor system keeps Claude on track. Log bugs without derailing, pivot explicitly when needed, check-in every 15 minutes.</p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🔧</div>
        <h3>MCP Tools</h3>
        <p>Built-in MCP server gives Claude tools like <code>chkd_status</code>, <code>chkd_tick</code>, <code>chkd_bug</code> for seamless workflow.</p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <h3>Visual Progress</h3>
        <p>Dashboard shows real-time progress, current task, bugs, quick wins, and worker status across all your repos.</p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">💻</div>
        <h3>CLI Commands</h3>
        <p>Full CLI for humans: <code>chkd status</code>, <code>chkd tick</code>, <code>chkd bug</code>, <code>chkd impromptu</code> and more.</p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🐛</div>
        <h3>Bug Tracking</h3>
        <p>Quick-log bugs without losing focus. Come back later with <code>/bugfix</code> to investigate and fix systematically.</p>
      </div>
    </div>
  </section>

  <section class="workflow">
    <h2>The Workflow</h2>
    <div class="workflow-steps">
      <div class="step">
        <div class="step-number">1</div>
        <div class="step-content">
          <h3>Define your spec</h3>
          <p>Write features in <code>docs/SPEC.md</code> with clear acceptance criteria and sub-tasks.</p>
        </div>
      </div>

      <div class="step">
        <div class="step-number">2</div>
        <div class="step-content">
          <h3>Start building</h3>
          <p>Run <code>/chkd SD.1</code> to start a task. Claude explores, designs, implements, and ticks as it goes.</p>
        </div>
      </div>

      <div class="step">
        <div class="step-number">3</div>
        <div class="step-content">
          <h3>Stay on track</h3>
          <p>Dashboard shows progress. Bugs get logged, not fixed mid-task. Check-ins keep you aligned.</p>
        </div>
      </div>

      <div class="step">
        <div class="step-number">4</div>
        <div class="step-content">
          <h3>Ship with confidence</h3>
          <p>All work is tracked. Nothing falls through the cracks. Review what got built.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="get-started">
    <h2>Get Started</h2>
    <div class="code-block">
      <pre><code># Clone and install
git clone https://github.com/your-org/chkd
cd chkd && npm install

# Start the dev server
npm run dev

# In your project, add to CLAUDE.md to enable MCP tools</code></pre>
    </div>
    <div class="cta-buttons">
      <a href="/guide" class="btn btn-primary btn-lg">Read Full Guide</a>
      <a href="/ideas" class="btn btn-secondary btn-lg">Submit Feature Ideas</a>
    </div>
  </section>

  <footer class="footer">
    <p>Built for developers who want Claude to build systematically.</p>
  </footer>
</div>

<style>
  .home {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-xl);
  }

  /* Hero */
  .hero {
    text-align: center;
    padding: var(--space-2xl) 0;
    margin-bottom: var(--space-2xl);
  }

  .logo {
    font-size: 4rem;
    font-weight: var(--font-bold);
    color: var(--primary);
    margin-bottom: var(--space-sm);
    letter-spacing: -2px;
  }

  .tagline {
    font-size: var(--text-xl);
    color: var(--text);
    margin-bottom: var(--space-md);
    font-weight: var(--font-medium);
  }

  .description {
    font-size: var(--text-base);
    color: var(--text-muted);
    max-width: 600px;
    margin: 0 auto var(--space-xl);
    line-height: var(--leading-relaxed);
  }

  .cta-buttons {
    display: flex;
    gap: var(--space-md);
    justify-content: center;
    flex-wrap: wrap;
  }

  /* Features */
  .features, .workflow, .get-started {
    margin-bottom: var(--space-2xl);
  }

  .features h2, .workflow h2, .get-started h2 {
    text-align: center;
    font-size: var(--text-2xl);
    margin-bottom: var(--space-xl);
    color: var(--text);
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-lg);
  }

  .feature-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
  }

  .feature-icon {
    font-size: 2rem;
    margin-bottom: var(--space-md);
  }

  .feature-card h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-sm);
    color: var(--text);
  }

  .feature-card p {
    color: var(--text-muted);
    line-height: var(--leading-relaxed);
  }

  .feature-card code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  /* Workflow */
  .workflow-steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    max-width: 700px;
    margin: 0 auto;
  }

  .step {
    display: flex;
    gap: var(--space-lg);
    align-items: flex-start;
  }

  .step-number {
    width: 40px;
    height: 40px;
    background: var(--primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: var(--font-bold);
    flex-shrink: 0;
  }

  .step-content h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-xs);
    color: var(--text);
  }

  .step-content p {
    color: var(--text-muted);
  }

  .step-content code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  /* Get Started */
  .get-started {
    text-align: center;
  }

  .code-block {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
    text-align: left;
  }

  .code-block pre {
    margin: 0;
  }

  .code-block code {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text);
    line-height: var(--leading-relaxed);
  }

  /* Footer */
  .footer {
    text-align: center;
    padding-top: var(--space-2xl);
    border-top: 1px solid var(--border);
    color: var(--text-muted);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .home {
      padding: var(--space-lg);
    }

    .logo {
      font-size: 3rem;
    }

    .feature-grid {
      grid-template-columns: 1fr;
    }

    .step {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
  }
</style>
