<script lang="ts">
</script>

<div class="guide-page">
  <h1>Troubleshooting</h1>
  <p class="lead">Solutions for common issues.</p>

  <section>
    <h2>Installation Issues</h2>

    <div class="issue">
      <h3>"chkd: command not found"</h3>
      <p>The CLI isn't linked globally.</p>
      <div class="solution">
        <strong>Solution:</strong>
        <div class="code-block"><pre><code>cd ~/chkd && sudo npm link</code></pre></div>
      </div>
    </div>

    <div class="issue">
      <h3>"Cannot connect to chkd"</h3>
      <p>The chkd server isn't running.</p>
      <div class="solution">
        <strong>Solution:</strong>
        <div class="code-block"><pre><code>cd ~/chkd && npm run dev</code></pre></div>
        <p>Keep this terminal open while using chkd.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>MCP Issues</h2>

    <div class="issue">
      <h3>MCP tools not showing up in Claude</h3>
      <p>Claude Code doesn't see the chkd tools.</p>
      <div class="solution">
        <strong>Solutions:</strong>
        <ol>
          <li>Check your MCP config path is correct</li>
          <li>Restart Claude Code after config changes</li>
          <li>Verify the server is running: <code>curl http://localhost:3847/api/status</code></li>
        </ol>
      </div>
    </div>

    <div class="issue">
      <h3>"Server outdated" warning</h3>
      <p>The MCP server file has been updated since the session started.</p>
      <div class="solution">
        <strong>Solution:</strong>
        <p>Exit Claude Code and start a new session. The new session will use the updated server.</p>
      </div>
    </div>

    <div class="issue">
      <h3>"No such tool available"</h3>
      <p>You're trying to use a tool that doesn't exist or isn't loaded.</p>
      <div class="solution">
        <strong>Solutions:</strong>
        <ol>
          <li>Check tool name spelling</li>
          <li>Restart Claude Code to reload MCP config</li>
          <li>Verify the tool exists: check <code>server-http.ts</code></li>
        </ol>
      </div>
    </div>
  </section>

  <section>
    <h2>Task Issues</h2>

    <div class="issue">
      <h3>"Task not found"</h3>
      <p>chkd can't find the specified task in the database.</p>
      <div class="solution">
        <strong>Solutions:</strong>
        <ol>
          <li>Check the task ID format: <code>SD.1</code>, not <code>SD1</code></li>
          <li>Run <code>chkd status</code> to see available tasks</li>
          <li>Add the task with <code>chkd add</code> if it doesn't exist</li>
        </ol>
      </div>
    </div>

    <div class="issue">
      <h3>Progress not updating</h3>
      <p>The UI shows old progress.</p>
      <div class="solution">
        <strong>Solutions:</strong>
        <ol>
          <li>Refresh the browser</li>
          <li>Check that the server is running</li>
          <li>Run <code>chkd status</code> to verify from CLI</li>
        </ol>
      </div>
    </div>

    <div class="issue">
      <h3>Need to migrate from SPEC.md</h3>
      <p>You have an old docs/SPEC.md file.</p>
      <div class="solution">
        <strong>Solution:</strong>
        <div class="code-block"><pre><code>chkd migrate</code></pre></div>
        <p>This imports tasks to the database and deletes the SPEC.md file.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Session Issues</h2>

    <div class="issue">
      <h3>Session stuck / can't start new session</h3>
      <p>A session is blocking new work.</p>
      <div class="solution">
        <strong>Solution:</strong>
        <div class="code-block"><pre><code>chkd done</code></pre></div>
        <p>This ends the current session and returns to idle state.</p>
      </div>
    </div>

    <div class="issue">
      <h3>Off-track warnings</h3>
      <p>You keep getting "OFF TRACK" warnings.</p>
      <div class="solution">
        <strong>Solutions:</strong>
        <ol>
          <li>Return to your anchor task</li>
          <li>Or pivot officially: <code>chkd_pivot(taskId: "NEW.1", taskTitle: "New task")</code></li>
        </ol>
      </div>
    </div>

    <div class="issue">
      <h3>Check-in timer keeps triggering</h3>
      <p>You get frequent check-in reminders.</p>
      <div class="solution">
        <strong>Solution:</strong>
        <p>Use <code>chkd_pulse("status update")</code> to reset the timer while staying engaged.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Still Stuck?</h2>
    <ul>
      <li>Check the <a href="/guide/faq">FAQ</a> for common questions</li>
      <li>Run <code>chkd help</code> for command reference</li>
      <li>Check the terminal for error messages</li>
      <li>Look at the browser console for UI errors</li>
    </ul>
  </section>
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

  .issue {
    margin-bottom: 32px;
    padding: 20px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
  }

  .issue h3 {
    margin-top: 0;
    margin-bottom: 8px;
    color: #ef4444;
    font-family: 'SF Mono', Consolas, monospace;
  }

  .issue > p {
    color: var(--text-muted, #888);
    margin-bottom: 16px;
  }

  .solution {
    background: var(--surface-dark, #0d0d1a);
    border-radius: 6px;
    padding: 16px;
  }

  .solution strong {
    color: #22c55e;
  }

  .code-block {
    background: var(--bg, #0d0d1a);
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

  ol, ul {
    padding-left: 24px;
    margin: 12px 0;
  }

  li {
    margin-bottom: 8px;
  }

  a {
    color: var(--accent, #8b5cf6);
  }
</style>
