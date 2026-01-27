<script lang="ts">
  let copiedIndex: number | null = null;

  function copyCode(code: string, index: number) {
    navigator.clipboard.writeText(code);
    copiedIndex = index;
    setTimeout(() => copiedIndex = null, 2000);
  }
</script>

<div class="guide-page">
  <h1>Quick Start</h1>
  <p class="lead">Get chkd running in 5 minutes.</p>

  <div class="prereqs">
    <h3>Prerequisites</h3>
    <ul>
      <li>Node.js 18+</li>
      <li>Git</li>
      <li>Claude Code (or claude.ai with MCP support)</li>
    </ul>
  </div>

  <section class="step">
    <div class="step-header">
      <span class="step-number">1</span>
      <h2>Clone and Install chkd</h2>
      <span class="step-time">~1 min</span>
    </div>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('git clone https://github.com/yourusername/chkd.git ~/chkd\ncd ~/chkd\nnpm install\nsudo npm link', 1)}>
        {copiedIndex === 1 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>git clone https://github.com/yourusername/chkd.git ~/chkd
cd ~/chkd
npm install
sudo npm link</code></pre>
    </div>
  </section>

  <section class="step">
    <div class="step-header">
      <span class="step-number">2</span>
      <h2>Start the Server</h2>
      <span class="step-time">~30 sec</span>
    </div>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('cd ~/chkd && npm run dev', 2)}>
        {copiedIndex === 2 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>cd ~/chkd && npm run dev</code></pre>
    </div>
    <p class="note">Server runs at <code>http://localhost:3847</code>. Keep this terminal open.</p>
  </section>

  <section class="step">
    <div class="step-header">
      <span class="step-number">3</span>
      <h2>Register the MCP Server</h2>
      <span class="step-time">~30 sec</span>
    </div>
    <p>Register chkd as a global MCP server so it's available in all projects:</p>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('claude mcp add --scope user chkd -- npx tsx ~/chkd/src/mcp/server-http.ts', 3)}>
        {copiedIndex === 3 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>claude mcp add --scope user chkd -- npx tsx ~/chkd/src/mcp/server-http.ts</code></pre>
    </div>
    <p class="note">The <code>--scope user</code> flag makes chkd available in all projects, including git worktrees for parallel development.</p>
    <p>Verify it's working:</p>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('claude mcp list', 31)}>
        {copiedIndex === 31 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>claude mcp list</code></pre>
    </div>
  </section>

  <section class="step">
    <div class="step-header">
      <span class="step-number">4</span>
      <h2>Add chkd to Your Project</h2>
      <span class="step-time">~1 min</span>
    </div>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('cd ~/my-project\ngit init  # if not already a git repo\nchkd upgrade', 4)}>
        {copiedIndex === 4 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>cd ~/my-project
git init  # if not already a git repo
chkd upgrade</code></pre>
    </div>
    <p>This creates:</p>
    <ul>
      <li><code>docs/GUIDE.md</code> - This guide</li>
      <li><code>CLAUDE.md</code> - Instructions for Claude</li>
      <li><code>.claude/skills/</code> - Build skills</li>
    </ul>
    <p>Tasks are stored in the chkd database at <code>~/.chkd/chkd.db</code></p>
  </section>

  <section class="step">
    <div class="step-header">
      <span class="step-number">5</span>
      <h2>Add Your First Feature</h2>
      <span class="step-time">~30 sec</span>
    </div>
    <p>Use the CLI to add a feature:</p>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('chkd add "Login page" --area FE --story "Email/password form with validation"', 5)}>
        {copiedIndex === 5 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>chkd add "Login page" --area FE --story "Email/password form with validation"</code></pre>
    </div>
  </section>

  <section class="step">
    <div class="step-header">
      <span class="step-number">6</span>
      <h2>Build It!</h2>
      <span class="step-time">~1 min</span>
    </div>
    <p>Start Claude Code and use the build skill:</p>
    <div class="code-block">
      <button class="copy-btn" on:click={() => copyCode('claude\n# Then in Claude:\n/chkd FE.1', 6)}>
        {copiedIndex === 6 ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>claude
# Then in Claude:
/chkd FE.1</code></pre>
    </div>
    <p>Claude reads your spec and builds the feature following the 6-phase workflow.</p>
  </section>

  <div class="success-box">
    <h3>You're all set!</h3>
    <p>chkd is now tracking your project. Check the dashboard at <a href="http://localhost:3847">localhost:3847</a>.</p>
  </div>

  <div class="next-steps">
    <h3>Next Steps</h3>
    <ul>
      <li><a href="/guide/concepts">Core Concepts</a> - Understand how chkd works</li>
      <li><a href="/guide/workflow">Daily Workflow</a> - Best practices for daily use</li>
      <li><a href="/guide/cli">CLI Reference</a> - All available commands</li>
    </ul>
  </div>
</div>

<style>
  .guide-page {
    color: var(--text, #fff);
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 8px;
  }

  .lead {
    font-size: 1.25rem;
    color: var(--text-muted, #888);
    margin-bottom: 40px;
  }

  .prereqs {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 40px;
  }

  .prereqs h3 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 14px;
    text-transform: uppercase;
    color: var(--text-muted, #888);
  }

  .prereqs ul {
    margin: 0;
    padding-left: 20px;
  }

  .prereqs li {
    margin-bottom: 4px;
  }

  .step {
    margin-bottom: 48px;
    padding-bottom: 48px;
    border-bottom: 1px solid var(--border, #222);
  }

  .step:last-of-type {
    border-bottom: none;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--accent, #8b5cf6);
    border-radius: 50%;
    font-weight: 600;
    font-size: 14px;
  }

  .step-header h2 {
    flex: 1;
    margin: 0;
    font-size: 1.5rem;
  }

  .step-time {
    font-size: 13px;
    color: var(--text-muted, #888);
    background: var(--surface, #1a1a2e);
    padding: 4px 10px;
    border-radius: 12px;
  }

  .code-block {
    position: relative;
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    margin: 16px 0;
  }

  .copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--text-muted, #888);
    cursor: pointer;
  }

  .copy-btn:hover {
    color: var(--text, #fff);
    border-color: var(--accent, #8b5cf6);
  }

  pre {
    margin: 0;
    padding: 16px;
    overflow-x: auto;
  }

  code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 14px;
    line-height: 1.6;
  }

  p code {
    background: var(--surface, #1a1a2e);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }

  .note {
    font-size: 14px;
    color: var(--text-muted, #888);
  }

  .step ul {
    padding-left: 20px;
  }

  .step li {
    margin-bottom: 6px;
  }

  .success-box {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05));
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 12px;
    padding: 24px;
    margin: 40px 0;
  }

  .success-box h3 {
    color: #22c55e;
    margin-top: 0;
  }

  .success-box a {
    color: #22c55e;
  }

  .next-steps {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    padding: 24px;
  }

  .next-steps h3 {
    margin-top: 0;
    margin-bottom: 16px;
  }

  .next-steps ul {
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  .next-steps li {
    margin-bottom: 8px;
  }

  .next-steps a {
    color: var(--accent, #8b5cf6);
    text-decoration: none;
  }

  .next-steps a:hover {
    text-decoration: underline;
  }
</style>
