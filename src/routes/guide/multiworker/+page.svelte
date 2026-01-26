<script lang="ts">
</script>

<div class="guide-page">
  <h1>Multi-Worker System</h1>
  <p class="lead">Run parallel Claude workers for faster development.</p>

  <section>
    <h2>Prerequisites</h2>
    <div class="callout info">
      <strong>Important:</strong> Workers need MCP access. Ensure chkd is registered with user scope:
      <code class="block">claude mcp add --scope user chkd -- npx tsx ~/chkd/src/mcp/server-http.ts</code>
      <p>This makes chkd available in all projects, including git worktrees where workers run.</p>
    </div>
  </section>

  <section>
    <h2>Overview</h2>
    <p>The multi-worker system lets you run multiple Claude instances in parallel, each working on different tasks. A "Manager" Claude coordinates the workers, assigns tasks, and merges their changes.</p>

    <div class="diagram">
      <pre>{`
┌─────────────────────────────────────────────────────────┐
│                    Manager Claude                        │
│  • Assigns tasks          • Reviews changes             │
│  • Monitors progress      • Resolves conflicts          │
└─────────────────────────────────────────────────────────┘
                    │                    │
          ┌────────┴────────┐   ┌────────┴────────┐
          │    Worker 1     │   │    Worker 2     │
          │  (git worktree) │   │  (git worktree) │
          │    Task: SD.3   │   │    Task: BE.2   │
          └─────────────────┘   └─────────────────┘
      `}</pre>
    </div>
  </section>

  <section>
    <h2>When to Use Workers</h2>
    <ul>
      <li><strong>Independent tasks</strong> - Tasks that don't share files</li>
      <li><strong>Parallel features</strong> - Frontend + Backend simultaneously</li>
      <li><strong>Time pressure</strong> - Need to ship faster</li>
    </ul>

    <div class="callout warning">
      <strong>When NOT to use:</strong> Tasks that modify the same files, deeply interdependent features, or when you need tight coordination.
    </div>
  </section>

  <section>
    <h2>Spawning a Worker</h2>
    <p>From the Manager Claude session:</p>
    <div class="code-block">
      <pre><code>chkd_spawn_worker(taskId: "SD.3", taskTitle: "Dashboard layout")</code></pre>
    </div>

    <p>This creates:</p>
    <ol>
      <li>A new git worktree at <code>../project-worker-username-sd3/</code></li>
      <li>A feature branch <code>feature/sd3-dashboard-layout</code></li>
      <li>A worker record in the database</li>
    </ol>

    <p>You'll get a command to run in a new terminal:</p>
    <div class="code-block">
      <pre><code>cd ../project-worker-username-sd3 && claude</code></pre>
    </div>
  </section>

  <section>
    <h2>Worker Lifecycle</h2>
    <div class="lifecycle">
      <div class="stage">
        <span class="stage-badge pending">PENDING</span>
        <span>Worker created, waiting to start</span>
      </div>
      <div class="stage">
        <span class="stage-badge working">WORKING</span>
        <span>Worker actively implementing task</span>
      </div>
      <div class="stage">
        <span class="stage-badge merging">MERGING</span>
        <span>Task complete, ready for merge</span>
      </div>
      <div class="stage">
        <span class="stage-badge done">DONE</span>
        <span>Successfully merged, worker cleaned up</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Manager Tools</h2>

    <div class="tool-grid">
      <div class="tool-card">
        <code>chkd_workers()</code>
        <span>List all active workers</span>
      </div>
      <div class="tool-card">
        <code>chkd_pause_worker(id)</code>
        <span>Pause a worker</span>
      </div>
      <div class="tool-card">
        <code>chkd_resume_worker(id)</code>
        <span>Resume paused worker</span>
      </div>
      <div class="tool-card">
        <code>chkd_merge_worker(id)</code>
        <span>Merge worker changes</span>
      </div>
      <div class="tool-card">
        <code>chkd_stop_worker(id)</code>
        <span>Stop and clean up worker</span>
      </div>
      <div class="tool-card">
        <code>chkd_dead_workers()</code>
        <span>Find stuck workers</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Merging Changes</h2>
    <p>When a worker completes their task:</p>

    <ol>
      <li><strong>Auto-merge</strong> - If no conflicts, changes merge automatically</li>
      <li><strong>Conflict detection</strong> - chkd checks for conflicts before merging</li>
      <li><strong>Resolution UI</strong> - If conflicts exist, you choose: keep worker's changes, keep main, or abort</li>
    </ol>

    <div class="code-block">
      <pre><code>chkd_merge_worker(workerId: "abc123", autoMerge: true)</code></pre>
    </div>
  </section>

  <section>
    <h2>Best Practices</h2>
    <ul>
      <li>Keep tasks small and focused</li>
      <li>Assign tasks to different areas of the codebase</li>
      <li>Review worker progress regularly</li>
      <li>Merge completed work promptly to reduce conflicts</li>
      <li>Use the Manager's research tools before assigning complex tasks</li>
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
    margin-bottom: 16px;
  }

  .diagram {
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 16px;
    margin: 20px 0;
    overflow-x: auto;
  }

  .diagram pre {
    margin: 0;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  .callout {
    padding: 16px 20px;
    border-radius: 8px;
    margin: 20px 0;
  }

  .callout.warning {
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid rgba(234, 179, 8, 0.3);
  }

  .callout.info {
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .callout code.block {
    display: block;
    margin: 12px 0;
    padding: 12px;
    background: var(--surface-dark, #0d0d1a);
    border-radius: 6px;
    font-size: 13px;
  }

  .callout p {
    margin: 8px 0 0 0;
    font-size: 14px;
    color: var(--text-muted, #888);
  }

  .code-block {
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    margin: 16px 0;
  }

  pre {
    margin: 0;
    padding: 16px;
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

  .lifecycle {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0;
  }

  .stage {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: var(--surface, #1a1a2e);
    border-radius: 8px;
  }

  .stage-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .stage-badge.pending { background: #666; }
  .stage-badge.working { background: #22c55e; color: #000; }
  .stage-badge.merging { background: #eab308; color: #000; }
  .stage-badge.done { background: #8b5cf6; }

  .tool-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin: 20px 0;
  }

  .tool-card {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tool-card code {
    color: var(--accent, #8b5cf6);
  }

  .tool-card span {
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  ol, ul {
    padding-left: 24px;
    margin: 12px 0;
  }

  li {
    margin-bottom: 8px;
  }

  @media (max-width: 768px) {
    .tool-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
