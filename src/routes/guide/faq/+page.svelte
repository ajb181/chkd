<script lang="ts">
</script>

<div class="guide-page">
  <h1>FAQ</h1>
  <p class="lead">Frequently asked questions about chkd.</p>

  <section>
    <h2>General</h2>

    <div class="faq-item">
      <h3>What is chkd?</h3>
      <p>chkd (pronounced "checked") is a development workflow tool that helps Claude build software systematically. It tracks tasks in a spec file, provides a visual dashboard, and offers MCP tools to keep Claude focused on planned work.</p>
    </div>

    <div class="faq-item">
      <h3>Do I need an Anthropic API key?</h3>
      <p>No. chkd works with Claude Code (the CLI tool), which has its own authentication. chkd doesn't call the Anthropic API directly - it provides tools that Claude uses during your coding sessions.</p>
    </div>

    <div class="faq-item">
      <h3>Can I use chkd without Claude Code?</h3>
      <p>Partially. The CLI commands and dashboard work standalone, but the MCP tools (which provide the best experience) require Claude Code. You can use chkd to track tasks manually, but you'd miss the AI-assisted workflow.</p>
    </div>

    <div class="faq-item">
      <h3>Is my code sent anywhere?</h3>
      <p>chkd runs entirely locally. Your code, specs, and project data stay on your machine. The only external communication is between Claude Code and Anthropic's API (which is Claude Code's standard behavior, not chkd-specific).</p>
    </div>
  </section>

  <section>
    <h2>Workflow</h2>

    <div class="faq-item">
      <h3>What's the difference between bugs and quick wins?</h3>
      <p><strong>Bugs</strong> are things that are broken - they have severity levels and a fix/verify workflow. <strong>Quick wins</strong> are small improvements or ideas - nice-to-haves that you might do when you have time. Use bugs for "it's broken", quick wins for "it would be nice if..."</p>
    </div>

    <div class="faq-item">
      <h3>Why does chkd keep asking me to check in?</h3>
      <p>The 15-minute check-in is designed to prevent scope creep and keep you aligned with your user. When prompted, call <code>chkd_checkin()</code> to do a structured check-in, or <code>chkd_pulse("status")</code> to reset the timer if you're on track.</p>
    </div>

    <div class="faq-item">
      <h3>What's an "anchor"?</h3>
      <p>The anchor is your current focus task. chkd tracks what you're supposed to be working on and warns you if you drift off-track. You can change your anchor with <code>chkd_pivot()</code> if priorities change.</p>
    </div>

    <div class="faq-item">
      <h3>Should I use CLI or MCP tools?</h3>
      <p>Use MCP tools when working with Claude - they're faster and Claude can call them directly. Use CLI commands for manual operations or when you're not in a Claude session.</p>
    </div>
  </section>

  <section>
    <h2>Tasks</h2>

    <div class="faq-item">
      <h3>How do I add tasks?</h3>
      <p>Use the CLI or MCP tools:</p>
      <div class="code-block"><pre><code>chkd add "Feature Name" --area SD
chkd add "Another Feature" --area FE --story "As a user..."</code></pre></div>
      <p>Areas: SD (Site Design), FE (Frontend), BE (Backend), FUT (Future)</p>
    </div>

    <div class="faq-item">
      <h3>What do the status markers mean?</h3>
      <ul>
        <li><code>○</code> - Not started (open)</li>
        <li><code>~</code> - In progress (set by <code>chkd working</code>)</li>
        <li><code>✓</code> - Complete (set by <code>chkd tick</code>)</li>
      </ul>
    </div>

    <div class="faq-item">
      <h3>I have an old SPEC.md file. How do I migrate?</h3>
      <p>Run <code>chkd migrate</code> - this imports your tasks to the database and deletes the SPEC.md file.</p>
    </div>
  </section>

  <section>
    <h2>Multi-Worker</h2>

    <div class="faq-item">
      <h3>When should I use multiple workers?</h3>
      <p>Use workers when you have independent tasks that don't share files - like building frontend and backend features simultaneously. Avoid workers for tasks that touch the same code, as you'll get merge conflicts.</p>
    </div>

    <div class="faq-item">
      <h3>How do workers stay in sync?</h3>
      <p>Each worker operates in its own git worktree with a dedicated branch. The Manager Claude coordinates tasks and merges changes back. Workers don't directly communicate with each other.</p>
    </div>
  </section>

  <section>
    <h2>Troubleshooting</h2>

    <div class="faq-item">
      <h3>Claude can't see the chkd tools</h3>
      <p>Check that: (1) Your MCP config path is correct, (2) The chkd server is running, (3) You've restarted Claude Code after config changes. Run <code>curl http://localhost:3847/api/status</code> to verify the server is up.</p>
    </div>

    <div class="faq-item">
      <h3>I'm getting "Server outdated" warnings</h3>
      <p>The MCP server file has been modified since your session started. Exit Claude Code and start a new session to pick up the changes.</p>
    </div>

    <div class="faq-item">
      <h3>Commands aren't working</h3>
      <p>Make sure: (1) You've run <code>sudo npm link</code> from the chkd directory, (2) The server is running on port 3847, (3) You're in a git repository.</p>
    </div>
  </section>

  <p class="more-help">Still have questions? Check the <a href="/guide/troubleshooting">Troubleshooting guide</a> or run <code>chkd help</code> for command reference.</p>
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

  section {
    margin-bottom: 48px;
  }

  section h2 {
    font-size: 1.5rem;
    margin-bottom: 20px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #333);
  }

  .faq-item {
    margin-bottom: 24px;
    padding: 20px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
  }

  .faq-item h3 {
    margin-top: 0;
    margin-bottom: 12px;
    color: var(--accent, #8b5cf6);
  }

  .faq-item p {
    margin: 0 0 12px;
    color: var(--text-muted, #ccc);
    line-height: 1.6;
  }

  .faq-item p:last-child {
    margin-bottom: 0;
  }

  .code-block {
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    margin: 12px 0;
  }

  pre {
    margin: 0;
    padding: 12px;
    overflow-x: auto;
  }

  code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 13px;
  }

  p code {
    background: var(--surface, #1a1a2e);
    padding: 2px 6px;
    border-radius: 4px;
  }

  ul {
    padding-left: 24px;
    margin: 12px 0;
  }

  li {
    margin-bottom: 8px;
  }

  a {
    color: var(--accent, #8b5cf6);
  }

  .more-help {
    margin-top: 40px;
    padding: 20px;
    background: var(--surface, #1a1a2e);
    border-radius: 8px;
    text-align: center;
  }
</style>
