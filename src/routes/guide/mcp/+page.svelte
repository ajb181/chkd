<script lang="ts">
</script>

<div class="guide-page">
  <h1>MCP Tools Reference</h1>
  <p class="lead">All MCP tools available to Claude for chkd integration.</p>

  <section>
    <h2>Core Tools</h2>
    <p>These are the essential tools Claude uses most often.</p>

    <div class="tool">
      <h3>chkd_status</h3>
      <p>Get current project status, progress, and active task. Run this first to understand where you are.</p>
      <div class="code-block"><pre><code>chkd_status()</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_working</h3>
      <p>Signal starting work on a spec item.</p>
      <div class="code-block"><pre><code>chkd_working(item: "SD.1")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_tick</h3>
      <p>Mark a spec item as complete.</p>
      <div class="code-block"><pre><code>chkd_tick(item: "SD.1")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_suggest</h3>
      <p>Get suggestions for what to work on next based on spec analysis.</p>
      <div class="code-block"><pre><code>chkd_suggest()</code></pre></div>
    </div>
  </section>

  <section>
    <h2>Session Tools</h2>

    <div class="tool">
      <h3>chkd_impromptu</h3>
      <p>Start an ad-hoc work session for unplanned work.</p>
      <div class="code-block"><pre><code>chkd_impromptu(description: "Quick data export script")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_debug</h3>
      <p>Start a debug/investigation session.</p>
      <div class="code-block"><pre><code>chkd_debug(description: "Why login is slow")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_done</h3>
      <p>End the current session (impromptu, debug, or feature work).</p>
      <div class="code-block"><pre><code>chkd_done()</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_pulse</h3>
      <p>Send a status update and reset the check-in timer.</p>
      <div class="code-block"><pre><code>chkd_pulse(status: "Working on validation logic")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_checkin</h3>
      <p>Do a structured 15-minute check-in with the user.</p>
      <div class="code-block"><pre><code>chkd_checkin()</code></pre></div>
    </div>
  </section>

  <section>
    <h2>Bug Tools</h2>

    <div class="tool">
      <h3>chkd_bug</h3>
      <p>Log a bug you noticed without derailing from current work.</p>
      <div class="code-block"><pre><code>chkd_bug(description: "Save button not working", severity: "high")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_bugs</h3>
      <p>List all open bugs in the project.</p>
      <div class="code-block"><pre><code>chkd_bugs()</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_bugfix</h3>
      <p>Start working on a bug with alignment step.</p>
      <div class="code-block"><pre><code>chkd_bugfix(query: "Save button")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_fix</h3>
      <p>Signal that a fix is ready for user verification.</p>
      <div class="code-block"><pre><code>chkd_fix(query: "Save button")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_resolve</h3>
      <p>Close a bug after user has verified the fix.</p>
      <div class="code-block"><pre><code>chkd_resolve(query: "Save button")</code></pre></div>
    </div>
  </section>

  <section>
    <h2>Quick Win Tools</h2>

    <div class="tool">
      <h3>chkd_win</h3>
      <p>Add a quick win - small improvement to do later.</p>
      <div class="code-block"><pre><code>chkd_win(title: "Add loading spinner to save button")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_wins</h3>
      <p>List all quick wins.</p>
      <div class="code-block"><pre><code>chkd_wins()</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_won</h3>
      <p>Mark a quick win as done.</p>
      <div class="code-block"><pre><code>chkd_won(query: "loading spinner")</code></pre></div>
    </div>
  </section>

  <section>
    <h2>Spec Tools</h2>

    <div class="tool">
      <h3>chkd_add</h3>
      <p>Add a new feature/task to the spec with workflow sub-tasks.</p>
      <div class="code-block"><pre><code>chkd_add(title: "User authentication", areaCode: "BE", description: "Login and session management")</code></pre></div>
    </div>

    <div class="tool">
      <h3>chkd_add_child</h3>
      <p>Add a sub-task to an existing spec item.</p>
      <div class="code-block"><pre><code>chkd_add_child(parentId: "SD.1", title: "Add form validation")</code></pre></div>
    </div>
  </section>

  <p class="note">For multi-worker tools, see the <a href="/guide/multiworker">Multi-Worker guide</a>.</p>
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
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #333);
  }

  .tool {
    margin-bottom: 24px;
    padding: 20px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
  }

  .tool h3 {
    margin-top: 0;
    margin-bottom: 8px;
    font-family: 'SF Mono', Consolas, monospace;
    color: var(--accent, #8b5cf6);
  }

  .tool p {
    margin-bottom: 12px;
    color: var(--text-muted, #ccc);
  }

  .code-block {
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
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

  .note {
    margin-top: 40px;
    padding: 16px;
    background: var(--surface, #1a1a2e);
    border-radius: 8px;
    font-size: 14px;
  }

  .note a {
    color: var(--accent, #8b5cf6);
  }
</style>
