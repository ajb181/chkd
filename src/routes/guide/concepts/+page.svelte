<script lang="ts">
</script>

<div class="guide-page">
  <h1>Core Concepts</h1>
  <p class="lead">Understanding the key ideas behind chkd.</p>

  <section class="concept">
    <h2>Task Database</h2>
    <p>The chkd database at <code>~/.chkd/chkd.db</code> is the single source of truth for what you're building.</p>

    <div class="code-block">
      <pre><code>{`chkd status

📋 Frontend
  ~  FE.1 Login page - Email/password form
     ○  Design form layout
     ○  Add validation
     ○  Connect to API
  ✓  FE.2 Dashboard - User stats display`}</code></pre>
    </div>

    <h3>Area Codes</h3>
    <div class="grid-2">
      <div class="card">
        <strong>SD</strong> - Site Design
        <span class="muted">UI, pages, layouts, flows</span>
      </div>
      <div class="card">
        <strong>FE</strong> - Frontend
        <span class="muted">Components, state, logic</span>
      </div>
      <div class="card">
        <strong>BE</strong> - Backend
        <span class="muted">APIs, database, services</span>
      </div>
      <div class="card">
        <strong>FUT</strong> - Future
        <span class="muted">Planned but not started</span>
      </div>
    </div>

    <h3>Status Markers</h3>
    <table>
      <tbody>
        <tr><td><code>[ ]</code></td><td>Not started</td></tr>
        <tr><td><code>[~]</code></td><td>In progress</td></tr>
        <tr><td><code>[x]</code></td><td>Complete</td></tr>
        <tr><td><code>[!]</code></td><td>Blocked</td></tr>
      </tbody>
    </table>
  </section>

  <section class="concept">
    <h2>Sessions</h2>
    <p>A session tracks what Claude is working on right now.</p>

    <div class="session-types">
      <div class="session-type building">
        <div class="type-badge">BUILDING</div>
        <div class="type-desc">Working on a spec task</div>
      </div>
      <div class="session-type impromptu">
        <div class="type-badge">IMPROMPTU</div>
        <div class="type-desc">Ad-hoc work not in spec</div>
      </div>
      <div class="session-type debug">
        <div class="type-badge">DEBUG</div>
        <div class="type-desc">Investigation/troubleshooting</div>
      </div>
      <div class="session-type idle">
        <div class="type-badge">IDLE</div>
        <div class="type-desc">No active work</div>
      </div>
    </div>

    <p>Sessions track:</p>
    <ul>
      <li>Current task and sub-item</li>
      <li>Start time and duration</li>
      <li>Iteration count</li>
      <li>"Also did" list (side work)</li>
    </ul>
  </section>

  <section class="concept">
    <h2>The 6-Phase Workflow</h2>
    <p>Every feature follows this proven pattern:</p>

    <div class="workflow">
      <div class="phase">
        <div class="phase-num">1</div>
        <div class="phase-content">
          <strong>Explore</strong>
          <span>Understand the problem, research existing patterns</span>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">2</div>
        <div class="phase-content">
          <strong>Design</strong>
          <span>Plan approach, define contracts and interfaces</span>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">3</div>
        <div class="phase-content">
          <strong>Prototype</strong>
          <span>Build with mock/test data for fast iteration</span>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">4</div>
        <div class="phase-content">
          <strong>Feedback</strong>
          <span>User reviews before real implementation</span>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">5</div>
        <div class="phase-content">
          <strong>Implement</strong>
          <span>Replace mock data with real logic</span>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">6</div>
        <div class="phase-content">
          <strong>Polish</strong>
          <span>Error states, edge cases, loading states</span>
        </div>
      </div>
    </div>

    <div class="callout tip">
      <strong>Why this order?</strong>
      Get user feedback BEFORE investing in real implementation. Prototypes can be thrown away if wrong.
    </div>
  </section>

  <section class="concept">
    <h2>Anchors</h2>
    <p>The anchor is your intended focus - what you asked Claude to work on.</p>

    <div class="anchor-example">
      <div class="anchor-box">
        <span class="anchor-label">Anchor</span>
        <span class="anchor-value">SD.1 Login page</span>
      </div>
      <p>If Claude starts working on something else, you'll see:</p>
      <div class="warning-box">
        <span>OFF TRACK: Anchor is "Login page" - return or pivot</span>
      </div>
    </div>

    <p>This prevents scope creep and keeps work focused.</p>
  </section>

  <section class="concept">
    <h2>Bugs vs Quick Wins</h2>

    <div class="comparison">
      <div class="comparison-col">
        <h3>Bugs</h3>
        <ul>
          <li>Issues that need fixing</li>
          <li>Have severity levels</li>
          <li>Require verification workflow</li>
          <li>Tracked in database</li>
        </ul>
        <div class="code-block small">
          <pre><code>chkd bug "Save button broken"</code></pre>
        </div>
      </div>
      <div class="comparison-col">
        <h3>Quick Wins</h3>
        <ul>
          <li>Small improvements (&lt;30 min)</li>
          <li>No severity tracking</li>
          <li>Simple toggle complete</li>
          <li>Stored in QUICKWINS.md</li>
        </ul>
        <div class="code-block small">
          <pre><code>chkd win "Add loading spinner"</code></pre>
        </div>
      </div>
    </div>
  </section>

  <div class="next-steps">
    <h3>Next Steps</h3>
    <ul>
      <li><a href="/guide/workflow">Daily Workflow</a> - Put these concepts into practice</li>
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

  .concept {
    margin-bottom: 48px;
    padding-bottom: 48px;
    border-bottom: 1px solid var(--border, #222);
  }

  .concept h2 {
    font-size: 1.75rem;
    margin-bottom: 16px;
  }

  .concept h3 {
    font-size: 1.1rem;
    margin-top: 24px;
    margin-bottom: 12px;
    color: var(--text-muted, #ccc);
  }

  .code-block {
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    margin: 16px 0;
  }

  .code-block.small {
    margin: 12px 0;
  }

  pre {
    margin: 0;
    padding: 16px;
    overflow-x: auto;
  }

  .code-block.small pre {
    padding: 12px;
  }

  code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 14px;
  }

  p code {
    background: var(--surface, #1a1a2e);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin: 16px 0;
  }

  .card {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card .muted {
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border, #222);
  }

  td:first-child {
    width: 80px;
  }

  .session-types {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 20px 0;
  }

  .session-type {
    text-align: center;
    padding: 16px;
    border-radius: 8px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
  }

  .type-badge {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
  }

  .building .type-badge { background: #22c55e; color: #000; }
  .impromptu .type-badge { background: #eab308; color: #000; }
  .debug .type-badge { background: #ef4444; color: #fff; }
  .idle .type-badge { background: #666; color: #fff; }

  .type-desc {
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  .workflow {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0;
  }

  .phase {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
  }

  .phase-num {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent, #8b5cf6);
    border-radius: 50%;
    font-weight: 600;
    flex-shrink: 0;
  }

  .phase-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .phase-content span {
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  .callout {
    padding: 16px 20px;
    border-radius: 8px;
    margin: 20px 0;
  }

  .callout.tip {
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .anchor-example {
    margin: 20px 0;
  }

  .anchor-box {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 12px;
  }

  .anchor-label {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--text-muted, #888);
  }

  .anchor-value {
    font-weight: 600;
    color: var(--accent, #8b5cf6);
  }

  .warning-box {
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid rgba(234, 179, 8, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    color: #eab308;
    font-size: 14px;
  }

  .comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 20px 0;
  }

  .comparison-col {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 20px;
  }

  .comparison-col h3 {
    margin-top: 0;
    margin-bottom: 12px;
  }

  .comparison-col ul {
    padding-left: 20px;
    margin-bottom: 16px;
  }

  .comparison-col li {
    margin-bottom: 6px;
    font-size: 14px;
  }

  .next-steps {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    padding: 24px;
    margin-top: 40px;
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

  @media (max-width: 768px) {
    .grid-2, .session-types, .comparison {
      grid-template-columns: 1fr;
    }
  }
</style>
