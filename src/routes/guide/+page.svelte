<script lang="ts">
  import { onMount } from 'svelte';
  import { getSession, getSpec, getRepos, getProposals } from '$lib/api';
  import type { Session, ParsedSpec, Repository } from '$lib/api';
  import { marked } from 'marked';

  export let data: { docs: Record<string, string>; docFiles: { id: string; name: string; file: string }[] };

  let session: Session | null = null;
  let spec: ParsedSpec | null = null;
  let repos: Repository[] = [];
  let currentRepo: Repository | null = null;
  let pendingProposals = 0;
  let loading = true;
  let activeSection = 'overview';
  let activeDoc = 'guide';

  // Render markdown to HTML
  function renderMarkdown(md: string): string {
    return marked(md) as string;
  }

  // Get repoPath from URL or use first available repo
  let repoPath = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('repo') || ''
    : '';

  onMount(() => {
    let interval: ReturnType<typeof setInterval>;

    // Load repos first, then start polling
    (async () => {
      const reposRes = await getRepos();
      if (reposRes.success && reposRes.data) {
        repos = reposRes.data;
        const urlRepo = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('repo')
          : null;

        if (urlRepo) {
          repoPath = urlRepo;
          currentRepo = repos.find(r => r.path === urlRepo) || null;
        } else if (repos.length > 0) {
          currentRepo = repos[0];
          repoPath = currentRepo.path;
        }
      }

      await loadData();
      loading = false;

      // Poll for session updates
      interval = setInterval(loadData, 5000);
    })();

    return () => {
      if (interval) clearInterval(interval);
    };
  });

  async function loadData() {
    if (!repoPath) return;
    const [sessionRes, specRes, proposalsRes] = await Promise.all([
      getSession(repoPath),
      getSpec(repoPath),
      getProposals(repoPath)
    ]);
    if (sessionRes.success) session = sessionRes.data || null;
    if (specRes.success && specRes.data) spec = specRes.data;
    if (proposalsRes.success) pendingProposals = proposalsRes.data?.pending || 0;
  }

  // Determine quick reference based on session state
  $: contextHelp = getContextHelp(session, pendingProposals);

  interface ContextHelp {
    state: string;
    stateColor: string;
    action: string;
    commands: { cmd: string; desc: string }[];
    tips: string[];
    warnings: string[];
  }

  function getContextHelp(session: Session | null, proposals: number): ContextHelp {
    const base: ContextHelp = {
      state: 'IDLE',
      stateColor: 'muted',
      action: 'Ready to build',
      commands: [],
      tips: [],
      warnings: []
    };

    // Add proposal warning if any pending
    if (proposals > 0) {
      base.warnings.push(`${proposals} pending proposal(s) need your response`);
    }

    if (!session || session.status === 'idle' || !session.currentTask) {
      return {
        ...base,
        state: 'IDLE',
        stateColor: 'muted',
        action: 'Ready to build',
        commands: [
          { cmd: '/chkd 3.2', desc: 'Build task 3.2' },
          { cmd: '/story', desc: 'Refine specs first' }
        ],
        tips: [
          'Browse stories in the UI to find what to work on',
          'Use /story to refine specs before building',
          'Task IDs match the spec numbering (3.2 = Phase 3, Item 2)'
        ]
      };
    }

    switch (session.status) {
      case 'building':
        return {
          ...base,
          state: 'BUILDING',
          stateColor: 'info',
          action: `Building: ${session.currentTask.title}`,
          commands: [
            { cmd: '/chkd', desc: 'Continue building' },
            { cmd: 'Off-plan work', desc: 'Logged as "Also did"' }
          ],
          tips: [
            'Stay focused on the current task',
            'Off-plan work is tracked, not blocked',
            'Check "Also did" list in the UI'
          ]
        };
      case 'ready_for_testing':
        return {
          ...base,
          state: 'TESTING',
          stateColor: 'warning',
          action: 'Review the changes',
          commands: [
            { cmd: 'Review tab', desc: 'See what changed' },
            { cmd: 'chkd proposals', desc: 'Check pending proposals' },
            { cmd: 'Give feedback', desc: 'Tell Claude what to fix' }
          ],
          tips: [
            'Test the feature in your app',
            'Check for edge cases',
            'Give specific feedback for improvements',
            'Approve or request rework'
          ]
        };
      case 'rework':
        return {
          ...base,
          state: 'REWORK',
          stateColor: 'warning',
          action: 'Fixing based on feedback',
          commands: [
            { cmd: '/chkd', desc: 'Continue fixing' },
            { cmd: 'Be specific', desc: 'Clear feedback helps' }
          ],
          tips: [
            'Claude is addressing your feedback',
            'Check iteration count to track progress',
            'More specific feedback = faster fixes'
          ]
        };
      case 'complete':
        return {
          ...base,
          state: 'COMPLETE',
          stateColor: 'success',
          action: 'Task complete!',
          commands: [
            { cmd: '/commit', desc: 'Commit changes safely' },
            { cmd: '/chkd 3.3', desc: 'Start next task' }
          ],
          tips: [
            'Review the diff before committing',
            'Write a clear commit message',
            'Start next task with /chkd'
          ]
        };
      default:
        return base;
    }
  }

  function formatElapsed(ms: number): string {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
</script>

<!-- Navigation Header -->
<header class="page-header">
  <div class="header-left">
    <a href="/{repoPath ? `?repo=${encodeURIComponent(repoPath)}` : ''}" class="nav-link back-link">← Back to Repo</a>
  </div>
  <div class="header-center">
    <span class="page-title">Guide</span>
    {#if currentRepo}
      <span class="repo-name">{currentRepo.name}</span>
    {/if}
  </div>
  <div class="header-right">
    {#if spec}
      <span class="progress-badge">{spec.progress}% complete</span>
    {/if}
  </div>
</header>

<!-- Doc Tabs -->
<nav class="doc-tabs">
  <button
    class="doc-tab"
    class:active={activeSection === 'overview'}
    on:click={() => activeSection = 'overview'}
  >
    Quick Start
  </button>
  {#each data.docFiles as doc}
    <button
      class="doc-tab"
      class:active={activeSection === 'docs' && activeDoc === doc.id}
      on:click={() => { activeSection = 'docs'; activeDoc = doc.id; }}
    >
      {doc.name}
    </button>
  {/each}
</nav>

{#if activeSection === 'docs'}
  <!-- Markdown Doc Viewer -->
  <div class="docs-page">
    <aside class="context-helper">
      <div class="helper-header">
        <span class="helper-badge info">DOCS</span>
      </div>
      <div class="helper-action">Reading: {data.docFiles.find(d => d.id === activeDoc)?.name}</div>
      <div class="doc-nav">
        {#each data.docFiles as doc}
          <button
            class="doc-nav-item"
            class:active={activeDoc === doc.id}
            on:click={() => activeDoc = doc.id}
          >
            {doc.name}
          </button>
        {/each}
      </div>
    </aside>
    <main class="docs-content">
      {@html renderMarkdown(data.docs[activeDoc] || '')}
    </main>
  </div>
{:else}
<div class="guide-page">
  <!-- Command Reference Sidebar -->
  <aside class="command-ref">
    <div class="ref-header">
      <span class="ref-badge {contextHelp.stateColor}">{contextHelp.state}</span>
      {#if session?.currentTask}
        <span class="ref-time">{formatElapsed(session.elapsedMs)}</span>
      {/if}
    </div>

    {#if session?.currentTask}
      <div class="ref-task">
        <div class="ref-task-label">Building:</div>
        <div class="ref-task-name">{session.currentTask.title}</div>
      </div>
    {/if}

    <!-- All Commands with context highlighting -->
    <div class="ref-section">
      <div class="ref-section-title">Skills (Claude Code)</div>
      <a href="#skills" class="ref-cmd" class:highlighted={contextHelp.state === 'BUILDING'}>
        <code>/chkd ID</code>
        <span>Build a task</span>
      </a>
      <a href="#story-mode" class="ref-cmd" class:highlighted={contextHelp.state === 'IDLE'}>
        <code>/story</code>
        <span>Plan & refine specs</span>
      </a>
      <a href="#fixing-bugs" class="ref-cmd">
        <code>/bugfix</code>
        <span>Fix bugs minimally</span>
      </a>
      <a href="#committing" class="ref-cmd" class:highlighted={contextHelp.state === 'COMPLETE'}>
        <code>/commit</code>
        <span>Safe commit flow</span>
      </a>
    </div>

    <div class="ref-section">
      <div class="ref-section-title">During Work</div>
      <a href="#sub-item-workflow" class="ref-cmd" class:highlighted={contextHelp.state === 'BUILDING'}>
        <code>chkd working "item"</code>
        <span>Start a sub-item</span>
      </a>
      <a href="#sub-item-workflow" class="ref-cmd" class:highlighted={contextHelp.state === 'BUILDING'}>
        <code>chkd tick "item"</code>
        <span>Complete sub-item</span>
      </a>
      <a href="#fixing-bugs" class="ref-cmd">
        <code>chkd bug "desc"</code>
        <span>Log a bug</span>
      </a>
      <a href="#" class="ref-cmd">
        <code>chkd also "desc"</code>
        <span>Log off-plan work</span>
      </a>
    </div>

    <div class="ref-section">
      <div class="ref-section-title">Status</div>
      <a href="#quick-start" class="ref-cmd" class:highlighted={contextHelp.state === 'IDLE'}>
        <code>chkd status</code>
        <span>What's going on?</span>
      </a>
      <a href="#" class="ref-cmd">
        <code>chkd progress</code>
        <span>Current task items</span>
      </a>
      <a href="#fixing-bugs" class="ref-cmd">
        <code>chkd bugs</code>
        <span>List open bugs</span>
      </a>
    </div>

    <div class="ref-section">
      <div class="ref-section-title">Session</div>
      <a href="#" class="ref-cmd">
        <code>chkd start "task"</code>
        <span>Begin a task</span>
      </a>
      <a href="#" class="ref-cmd">
        <code>chkd pause</code>
        <span>Pause with handover</span>
      </a>
      <a href="#" class="ref-cmd">
        <code>chkd sync idle</code>
        <span>Reset session</span>
      </a>
    </div>

    {#if spec}
      <div class="ref-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {spec.progress}%"></div>
        </div>
        <span class="progress-text">{spec.completedItems}/{spec.totalItems} ({spec.progress}%)</span>
      </div>
    {/if}
  </aside>

  <!-- Guide Content -->
  <main class="guide-content">
    <h1>chkd Development Guide</h1>
    <p class="tagline">How to build with chkd - plan in one place, build in another.</p>

    <section>
      <h2>How chkd Works</h2>
      <p><strong>One rule:</strong> Plan in one place, build in another.</p>

      <div class="comparison">
        <div class="compare-col">
          <h3>Planning</h3>
          <p><strong>Where:</strong> chkd UI</p>
          <ul>
            <li>Browse stories</li>
            <li>Refine specs</li>
            <li>Pick what to do</li>
          </ul>
        </div>
        <div class="compare-arrow">→</div>
        <div class="compare-col">
          <h3>Building</h3>
          <p><strong>Where:</strong> Terminal</p>
          <ul>
            <li>Claude implements</li>
            <li>Stays on-plan</li>
            <li>Marks complete</li>
          </ul>
        </div>
      </div>

      <p><em>Why separate? Planning = thinking, changing your mind. Building = executing, staying focused. Mixing them = scope creep.</em></p>
    </section>

    <section>
      <h2>The Workflow</h2>
      <div class="workflow-flow">
        <span class="flow-step">EXPLORE</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">DESIGN</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">PROTOTYPE</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">FEEDBACK</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">IMPLEMENT</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">POLISH</span>
      </div>
    </section>

    <section>
      <h2>Session Lifecycle</h2>

      <div class="lifecycle-full">
        <div class="lifecycle-row">
          <div class="state" class:active={contextHelp.state === 'IDLE'}>
            <span class="state-emoji">📋</span>
            <span class="state-name">IDLE</span>
            <span class="state-desc">No active task</span>
            <span class="state-action">Pick from UI</span>
          </div>
          <div class="state-arrow">→</div>
          <div class="state" class:active={contextHelp.state === 'BUILDING'}>
            <span class="state-emoji">🔨</span>
            <span class="state-name">BUILDING</span>
            <span class="state-desc">Claude implementing</span>
            <span class="state-action">Run /chkd</span>
          </div>
          <div class="state-arrow">→</div>
          <div class="state" class:active={contextHelp.state === 'TESTING'}>
            <span class="state-emoji">🔍</span>
            <span class="state-name">TESTING</span>
            <span class="state-desc">Ready for review</span>
            <span class="state-action">Check Review tab</span>
          </div>
        </div>

        <div class="lifecycle-row secondary">
          <div class="state-spacer"></div>
          <div class="state" class:active={contextHelp.state === 'REWORK'}>
            <span class="state-emoji">🔄</span>
            <span class="state-name">REWORK</span>
            <span class="state-desc">Fixing feedback</span>
            <span class="state-action">Run /chkd</span>
          </div>
          <div class="state-arrow-up">↑</div>
          <div class="state-note">Give feedback → triggers rework</div>
        </div>

        <div class="lifecycle-row">
          <div class="state-spacer"></div>
          <div class="state-arrow-down">↓</div>
          <div class="state" class:active={contextHelp.state === 'COMPLETE'}>
            <span class="state-emoji">✅</span>
            <span class="state-name">COMPLETE</span>
            <span class="state-desc">Task done!</span>
            <span class="state-action">Commit & next task</span>
          </div>
        </div>
      </div>

      <h3>Special States</h3>
      <div class="special-states">
        <div class="special-state debug">
          <span class="state-emoji">🐛</span>
          <span class="state-name">DEBUGGING</span>
          <span class="state-desc">Use /bugfix skill - focuses on fixing without feature creep</span>
        </div>
        <div class="special-state story">
          <span class="state-emoji">📝</span>
          <span class="state-name">STORY MODE</span>
          <span class="state-desc">Use /story skill - refining specs, not building yet</span>
        </div>
        <div class="special-state proposal">
          <span class="state-emoji">💡</span>
          <span class="state-name">PROPOSAL PENDING</span>
          <span class="state-desc">Claude proposed something - run chkd proposals to respond</span>
        </div>
      </div>
    </section>

    <section>
      <h2>Available Skills</h2>
      <div class="skills-grid">
        <div class="skill-card">
          <code>/chkd &lt;id&gt;</code>
          <p>Build a task (e.g., /chkd 3.2)</p>
        </div>
        <div class="skill-card">
          <code>/story</code>
          <p>Plan, refine specs, add features</p>
        </div>
        <div class="skill-card">
          <code>/bugfix</code>
          <p>Fix bugs without feature creep</p>
        </div>
        <div class="skill-card">
          <code>/commit</code>
          <p>Safe commit workflow</p>
        </div>
      </div>
    </section>

    <section>
      <h2>Slash Commands</h2>
      <p class="intro-text">Run these in Claude Code terminal.</p>

      <table class="commands-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>/chkd 3.2</code></td><td>Build task 3.2 from the spec</td></tr>
          <tr><td><code>/story</code></td><td>Refine specs, plan features</td></tr>
          <tr><td><code>/bugfix</code></td><td>Fix bugs with minimal changes</td></tr>
          <tr><td><code>/commit</code></td><td>Safe commit workflow</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Common Situations</h2>
      <table class="situations-table">
        <thead>
          <tr>
            <th>Situation</th>
            <th>What to do</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>"I have an idea"</td><td><code>/story</code></td></tr>
          <tr><td>"Story needs work"</td><td><code>/story</code></td></tr>
          <tr><td>"Ready to build"</td><td><code>/chkd 3.2</code> (use task ID)</td></tr>
          <tr><td>"Found a bug"</td><td><code>chkd bug "desc"</code> then <code>/bugfix</code></td></tr>
          <tr><td>"Did something off-plan"</td><td>Claude logs it as "Also did"</td></tr>
          <tr><td>"I'm done"</td><td><code>/commit</code></td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Fixing Bugs</h2>
      <p class="intro-text">The bugfix workflow keeps you focused on fixing without feature creep.</p>

      <h3>Capturing Bugs</h3>
      <p>You can capture bugs two ways:</p>

      <div class="bug-capture-methods">
        <div class="capture-method">
          <strong>🖥️ Dashboard</strong>
          <p>Click the 🐛 Bugs panel on the main dashboard. Type in the quick input and press Enter or click +.</p>
        </div>
        <div class="capture-method">
          <strong>⌨️ CLI</strong>
          <p>Run <code>chkd bug "description"</code> from your terminal.</p>
        </div>
      </div>

      <h3>Bug Severity Levels</h3>
      <p>Bugs have four severity levels to help you prioritize:</p>

      <div class="severity-table">
        <div class="severity-row critical">
          <span class="severity-icon">🔴</span>
          <span class="severity-name">Critical</span>
          <span class="severity-desc">App broken, data loss, security issue</span>
        </div>
        <div class="severity-row high">
          <span class="severity-icon">🟠</span>
          <span class="severity-name">High</span>
          <span class="severity-desc">Major feature broken, no workaround</span>
        </div>
        <div class="severity-row medium">
          <span class="severity-icon">🟡</span>
          <span class="severity-name">Medium</span>
          <span class="severity-desc">Feature broken but has workaround (default)</span>
        </div>
        <div class="severity-row low">
          <span class="severity-icon">🟢</span>
          <span class="severity-name">Low</span>
          <span class="severity-desc">Minor issue, cosmetic, edge case</span>
        </div>
      </div>

      <h3>CLI Commands</h3>
      <div class="code-block">
        <code># Quick-add a bug (medium severity)</code><br/>
        <code>chkd bug "Save button doesn't work"</code><br/><br/>
        <code># Add with severity</code><br/>
        <code>chkd bug "Login crash" --severity high</code><br/>
        <code>chkd bug "Typo in footer" --severity low</code><br/><br/>
        <code># See all open bugs</code><br/>
        <code>chkd bugs</code><br/><br/>
        <code># See all bugs including fixed</code><br/>
        <code>chkd bugs --all</code><br/><br/>
        <code># Mark bug as fixed</code><br/>
        <code>chkd fix "Save button"</code>
      </div>

      <h3>The Bugfix Process</h3>
      <p>Use <code>/bugfix</code> in Claude Code for guided debugging:</p>

      <div class="bugfix-flow">
        <div class="bugfix-step">
          <span class="bugfix-num">1</span>
          <div class="bugfix-content">
            <strong>Describe</strong>
            <p>What's broken? What did you expect?</p>
          </div>
        </div>
        <div class="bugfix-step">
          <span class="bugfix-num">2</span>
          <div class="bugfix-content">
            <strong>Research</strong>
            <p>Claude searches for similar issues, checks error logs</p>
          </div>
        </div>
        <div class="bugfix-step">
          <span class="bugfix-num">3</span>
          <div class="bugfix-content">
            <strong>Reproduce</strong>
            <p>Confirm the bug can be triggered</p>
          </div>
        </div>
        <div class="bugfix-step">
          <span class="bugfix-num">4</span>
          <div class="bugfix-content">
            <strong>Isolate</strong>
            <p>Find the root cause</p>
          </div>
        </div>
        <div class="bugfix-step">
          <span class="bugfix-num">5</span>
          <div class="bugfix-content">
            <strong>Fix</strong>
            <p>Change only what's needed - minimal changes</p>
          </div>
        </div>
        <div class="bugfix-step">
          <span class="bugfix-num">6</span>
          <div class="bugfix-content">
            <strong>Verify</strong>
            <p>You confirm it works</p>
          </div>
        </div>
      </div>

      <h3>Bugfix Rules</h3>
      <div class="bugfix-rules">
        <div class="rule rule-do">
          <strong>DO</strong>
          <ul>
            <li>Fix only the reported bug</li>
            <li>Make minimal changes</li>
            <li>Log other issues with <code>chkd bug</code></li>
            <li>Document findings in <code>.debug-notes.md</code></li>
          </ul>
        </div>
        <div class="rule rule-dont">
          <strong>DON'T</strong>
          <ul>
            <li>Add new features</li>
            <li>Refactor "while you're there"</li>
            <li>Clean up unrelated code</li>
            <li>Expand scope without approval</li>
          </ul>
        </div>
      </div>

      <h3>After Fixing</h3>
      <p>Run <code>chkd fix "bug"</code> to mark it done. You'll be prompted to capture learnings:</p>
      <ul>
        <li><strong>Root cause</strong> - What caused this bug?</li>
        <li><strong>Prevention</strong> - How to prevent similar bugs?</li>
        <li><strong>Detection</strong> - Should we add a test case?</li>
      </ul>
      <p>Consider using <code>/retro</code> in Claude Code for a guided retrospective that can update your project docs.</p>

      <h3>Debug Notes</h3>
      <p>During debugging, findings are saved to <code>.debug-notes.md</code> in your project:</p>
      <div class="code-block" style="font-size: 12px;">
        <code>## Debug Session: 2026-01-20 14:30</code><br/>
        <code>**Bug:** Save button doesn't work</code><br/><br/>
        <code>### Symptoms</code><br/>
        <code>- Button shows spinner forever</code><br/>
        <code>- Console: TypeError: Cannot read 'id'</code><br/><br/>
        <code>### Root Cause</code><br/>
        <code>- Line 87: user.id called when user is null</code><br/><br/>
        <code>### Fix Applied</code><br/>
        <code>- Added guard: if (!user) return;</code>
      </div>
      <p>This file builds a history of debugging sessions for future reference.</p>
    </section>

    <section>
      <h2>First Time Setup</h2>
      <p class="intro-text">Do this once to install the <code>chkd</code> command on your computer.</p>

      <div class="setup-box install-box">
        <div class="setup-steps">
          <div class="step">
            <span class="step-num">1</span>
            <span class="step-text">Open Terminal</span>
          </div>
          <div class="step">
            <span class="step-num">2</span>
            <span class="step-text">Go to the chkd folder:</span>
            <code class="step-code">cd /Users/alex/chkd-v2</code>
          </div>
          <div class="step">
            <span class="step-num">3</span>
            <span class="step-text">Install the command globally:</span>
            <code class="step-code">sudo npm link</code>
            <span class="step-note">(enter your Mac password when asked)</span>
          </div>
          <div class="step">
            <span class="step-num">4</span>
            <span class="step-text">Test it worked:</span>
            <code class="step-code">chkd help</code>
          </div>
        </div>

        <div class="success-check">
          ✓ If you see a list of commands, you're all set!
        </div>
      </div>

      <h3>Updating chkd</h3>
      <p>When chkd gets updated, pull the latest changes:</p>
      <div class="setup-box">
        <div class="setup-steps">
          <div class="step">
            <span class="step-num">1</span>
            <code class="step-code">cd /Users/alex/chkd-v2</code>
          </div>
          <div class="step">
            <span class="step-num">2</span>
            <code class="step-code">git pull</code>
          </div>
          <div class="step">
            <span class="step-num">3</span>
            <code class="step-code">npm install</code>
            <span class="step-note">(if dependencies changed)</span>
          </div>
        </div>
        <p class="note">That's it! Because we used <code>npm link</code>, changes are picked up automatically.</p>
      </div>
    </section>

    <section>
      <h2>Quick Start</h2>
      <p class="intro-text">The daily workflow once chkd is installed.</p>
      <ol class="quick-start">
        <li>Start the server: <code>npm run dev</code> (from chkd-v2 folder)</li>
        <li>Open UI: <code>http://localhost:3847</code> - find task ID (e.g., "3.2")</li>
        <li>In Claude Code: run <code>/chkd 3.2</code></li>
        <li>When done: <code>/commit</code></li>
        <li>Repeat with next task</li>
      </ol>
    </section>

    <section>
      <h2>Project Setup</h2>

      <h3>New Project (Greenfield)</h3>
      <div class="setup-box">
        <code class="setup-cmd">chkd init "My Project"</code>
        <p>Creates all the files you need: SPEC.md, CLAUDE.md, Guide, and skills.</p>

        <div class="setup-steps">
          <div class="step"><span class="step-num">1</span> <code>cd your-project</code></div>
          <div class="step"><span class="step-num">2</span> <code>git init</code> (if not already)</div>
          <div class="step"><span class="step-num">3</span> <code>chkd init "My Project"</code></div>
          <div class="step"><span class="step-num">4</span> Edit <code>docs/SPEC.md</code> with your features</div>
          <div class="step"><span class="step-num">5</span> Edit <code>CLAUDE.md</code> to describe your project</div>
        </div>
      </div>

      <h3>Existing Project (Brownfield)</h3>
      <div class="setup-box brownfield">
        <code class="setup-cmd">chkd upgrade</code>
        <p>For projects that already have code. Backs up your existing files, creates fresh templates.</p>

        <div class="setup-steps">
          <div class="step"><span class="step-num">1</span> <code>cd your-existing-project</code></div>
          <div class="step"><span class="step-num">2</span> <code>chkd upgrade</code></div>
          <div class="step"><span class="step-num">3</span> Review your backed up files (<code>*-old.md</code>)</div>
          <div class="step"><span class="step-num">4</span> Edit <code>docs/SPEC.md</code> - add your features</div>
          <div class="step"><span class="step-num">5</span> Mark existing features as [x] complete</div>
          <div class="step"><span class="step-num">6</span> Use <code>/story</code> in Claude to refine specs</div>
        </div>

        <div class="info-callout">
          <strong>What gets backed up:</strong>
          <ul>
            <li><code>docs/SPEC.md</code> → <code>docs/SPEC-old.md</code></li>
            <li><code>CLAUDE.md</code> → <code>CLAUDE-old.md</code></li>
            <li><code>.claude/skills/</code> → <code>.claude/skills-old/</code></li>
          </ul>
        </div>
      </div>

      <h3>After Brownfield Setup: Populate Your Spec</h3>
      <div class="discovery-flow">
        <p>Edit <code>docs/SPEC.md</code> to list your existing features and what's new:</p>

        <div class="code-block">
          <code># Mark existing features as complete</code><br/>
          <code>- [x] **BE.1 User Authentication** - Login, logout, sessions</code><br/>
          <code>- [x] **BE.2 Database Schema** - Users, posts, comments</code><br/><br/>
          <code># Add new features to build</code><br/>
          <code>- [ ] **BE.3 API Rate Limiting** - Protect endpoints</code>
        </div>

        <p>Use <code>/story</code> in Claude to help refine and expand your spec:</p>
        <div class="code-block">
          <code># In Claude Code terminal</code><br/>
          <code>/story</code><br/><br/>
          <code># Claude will help you:</code><br/>
          <code># - Clarify requirements</code><br/>
          <code># - Break down features into sub-tasks</code><br/>
          <code># - Apply the workflow phases</code>
        </div>
      </div>
    </section>

    <section>
      <h2>CLI Setup</h2>
      <p>To use <code>chkd</code> commands from anywhere on your computer:</p>

      <h3>One-Time Setup</h3>
      <div class="code-block">
        <code># Go to the chkd folder</code><br/>
        <code>cd /path/to/chkd-v2</code><br/><br/>
        <code># Build the code</code><br/>
        <code>npm run build</code><br/><br/>
        <code># Make "chkd" available everywhere</code><br/>
        <code>npm link</code>
      </div>

      <h3>After Editing chkd Code</h3>
      <div class="code-block">
        <code># Go to the chkd folder</code><br/>
        <code>cd /path/to/chkd-v2</code><br/><br/>
        <code># Rebuild</code><br/>
        <code>npm run build</code><br/><br/>
        <code># Done - your changes are live</code>
      </div>

      <div class="info-box">
        <strong>How it works:</strong> Your code lives in <code>src/cli/index.ts</code>.
        When you run <code>npm run build</code>, it compiles to <code>dist/cli/index.js</code>.
        The <code>npm link</code> command makes "chkd" point to that compiled file.
      </div>
    </section>

    <section>
      <h2>Troubleshooting</h2>
      <p class="intro-text">Common issues and how to fix them.</p>

      <div class="trouble-grid">
        <div class="trouble-item">
          <h3>chkd command not found</h3>
          <p><strong>Cause:</strong> CLI not installed globally</p>
          <p><strong>Fix:</strong></p>
          <div class="code-block">
            <code>cd /path/to/chkd-v2</code><br/>
            <code>sudo npm link</code>
          </div>
        </div>

        <div class="trouble-item">
          <h3>Cannot connect to chkd</h3>
          <p><strong>Cause:</strong> Dev server not running</p>
          <p><strong>Fix:</strong></p>
          <div class="code-block">
            <code>cd /path/to/chkd-v2</code><br/>
            <code>npm run dev</code>
          </div>
        </div>

        <div class="trouble-item">
          <h3>Task not found in spec</h3>
          <p><strong>Cause:</strong> Task ID doesn't match spec format</p>
          <p><strong>Fix:</strong> Check docs/SPEC.md for correct task IDs (e.g., SD.1, BE.2)</p>
        </div>

        <div class="trouble-item">
          <h3>Session stuck / wrong state</h3>
          <p><strong>Cause:</strong> Session didn't sync properly</p>
          <p><strong>Fix:</strong></p>
          <div class="code-block">
            <code>chkd sync idle</code>
          </div>
        </div>

        <div class="trouble-item">
          <h3>Spec not loading in UI</h3>
          <p><strong>Cause:</strong> Server cache or parsing error</p>
          <p><strong>Fix:</strong> Restart dev server, check SPEC.md format</p>
        </div>

        <div class="trouble-item">
          <h3>Skills not working</h3>
          <p><strong>Cause:</strong> Skills not synced to project</p>
          <p><strong>Fix:</strong></p>
          <div class="code-block">
            <code>chkd sync skills</code>
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2>Files That Matter</h2>
      <table class="files-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>docs/SPEC.md</code></td><td>Source of truth for features</td></tr>
          <tr><td><code>docs/GUIDE.md</code></td><td>How to use chkd (this guide)</td></tr>
          <tr><td><code>CLAUDE.md</code></td><td>Project instructions for Claude</td></tr>
          <tr><td><code>.claude/skills/</code></td><td>Skill definitions</td></tr>
        </tbody>
      </table>
    </section>
  </main>
</div>
{/if}

<style>
  /* Page Header */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-xl);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-left, .header-right {
    flex: 1;
  }

  .header-right {
    text-align: right;
  }

  .header-center {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .page-title {
    font-weight: 600;
    font-size: 16px;
  }

  .repo-name {
    color: var(--text-muted);
    font-size: 14px;
  }

  .repo-name::before {
    content: '·';
    margin-right: var(--space-sm);
  }

  .nav-link {
    color: var(--primary);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
  }

  .nav-link:hover {
    text-decoration: underline;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .progress-badge {
    background: var(--success);
    color: white;
    padding: 4px 10px;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 600;
  }

  .guide-page {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: var(--space-xl);
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-xl);
    min-height: 100vh;
  }

  /* Command Reference Sidebar */
  .command-ref {
    position: sticky;
    top: 80px;
    height: fit-content;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    font-size: 13px;
  }

  .ref-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .ref-badge {
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: white;
  }

  .ref-badge.muted { background: var(--text-muted); }
  .ref-badge.info { background: var(--info); }
  .ref-badge.warning { background: var(--warning); color: #333; }
  .ref-badge.success { background: var(--success); }

  .ref-time {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
  }

  .ref-task {
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
  }

  .ref-task-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ref-task-name {
    font-weight: 600;
    font-size: 13px;
  }

  .ref-section {
    margin-bottom: var(--space-md);
  }

  .ref-section-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-xs);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--border);
  }

  .ref-cmd {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--text);
    transition: background 0.15s;
  }

  .ref-cmd:hover {
    background: var(--bg);
  }

  .ref-cmd.highlighted {
    background: var(--info-bg);
    border-left: 2px solid var(--info);
  }

  .ref-cmd code {
    font-size: 11px;
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
  }

  .ref-cmd.highlighted code {
    background: var(--bg);
  }

  .ref-cmd span {
    font-size: 11px;
    color: var(--text-muted);
  }

  .ref-progress {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
  }

  .progress-bar {
    height: 6px;
    background: var(--bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: var(--space-xs);
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s;
  }

  .progress-text {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Guide Content */
  .guide-content {
    max-width: 700px;
  }

  .guide-content h1 {
    font-size: 32px;
    margin-bottom: var(--space-sm);
  }

  .tagline {
    font-size: 18px;
    color: var(--text-muted);
    margin-bottom: var(--space-2xl);
  }

  section {
    margin-bottom: var(--space-2xl);
  }

  section h2 {
    font-size: 20px;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border);
  }

  /* Comparison */
  .comparison {
    display: flex;
    align-items: stretch;
    gap: var(--space-md);
    margin: var(--space-lg) 0;
  }

  .compare-col {
    flex: 1;
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .compare-col h3 {
    margin: 0 0 var(--space-sm);
    font-size: 16px;
  }

  .compare-col ul {
    margin: var(--space-sm) 0 0;
    padding-left: var(--space-lg);
  }

  .compare-arrow {
    display: flex;
    align-items: center;
    font-size: 24px;
    color: var(--text-muted);
  }

  /* Workflow Flow */
  .workflow-flow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .flow-step {
    padding: var(--space-sm) var(--space-md);
    background: var(--primary);
    color: white;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
  }

  .flow-arrow {
    color: var(--text-muted);
  }

  /* Lifecycle */
  .lifecycle-full {
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
    padding: var(--space-lg);
  }

  .lifecycle-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .lifecycle-row.secondary {
    padding-left: var(--space-xl);
    opacity: 0.8;
  }

  .state {
    flex: 1;
    min-width: 120px;
    padding: var(--space-md);
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .state.active {
    border-color: var(--primary);
    background: var(--info-bg);
  }

  .state-emoji {
    display: block;
    font-size: 24px;
    margin-bottom: var(--space-xs);
  }

  .state-name {
    display: block;
    font-weight: 700;
    font-size: 14px;
    margin-bottom: var(--space-xs);
  }

  .state-desc {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: var(--space-xs);
  }

  .state-action {
    display: block;
    font-size: 11px;
    color: var(--primary);
    font-weight: 600;
  }

  .state-arrow, .state-arrow-up, .state-arrow-down {
    display: flex;
    align-items: center;
    color: var(--text-muted);
    font-size: 20px;
    padding: 0 var(--space-xs);
  }

  .state-note {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

  .state-spacer {
    flex: 1;
    min-width: 120px;
  }

  /* Special States */
  .special-states {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-md);
    margin-top: var(--space-lg);
  }

  .special-state {
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border-left: 4px solid var(--border);
  }

  .special-state.debug { border-left-color: var(--error); }
  .special-state.story { border-left-color: var(--info); }
  .special-state.proposal { border-left-color: var(--warning); }

  .special-state .state-emoji {
    display: inline;
    font-size: 16px;
    margin-right: var(--space-xs);
  }

  .special-state .state-name {
    display: inline;
    font-size: 14px;
  }

  .special-state .state-desc {
    display: block;
    margin-top: var(--space-xs);
  }

  /* Scope Management */
  .scope-flow {
    margin: var(--space-lg) 0;
  }

  .scope-box {
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
    padding: var(--space-lg);
    text-align: center;
  }

  .scope-title {
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }

  .scope-arrow {
    font-size: 24px;
    color: var(--text-muted);
    margin: var(--space-sm) 0;
  }

  .scope-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    text-align: left;
  }

  .scope-option {
    padding: var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-lg);
  }

  .scope-option strong {
    display: block;
    margin-bottom: var(--space-xs);
  }

  .scope-option p {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0 0 var(--space-xs);
  }

  .scope-option code {
    font-size: 12px;
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Setup Sections */
  .setup-steps {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
    font-size: 14px;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--primary);
    color: white;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
  }

  .setup-box.brownfield {
    background: linear-gradient(135deg, var(--bg-secondary), rgba(255, 193, 7, 0.1));
    border: 1px solid var(--warning);
  }

  .info-callout {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
    font-size: 13px;
  }

  .info-callout strong {
    display: block;
    margin-bottom: var(--space-xs);
  }

  .info-callout ul {
    margin: 0;
    padding-left: var(--space-lg);
  }

  .info-callout li {
    margin-bottom: var(--space-xs);
  }

  .discovery-flow {
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
  }

  .discovery-flow > p {
    margin: 0 0 var(--space-md);
  }

  /* Skills Grid */
  .skills-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
  }

  .skill-card {
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .skill-card code {
    font-size: 16px;
    font-weight: 600;
    color: var(--primary);
  }

  .skill-card p {
    margin: var(--space-xs) 0 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  th {
    background: var(--bg-secondary);
    font-weight: 600;
    font-size: 13px;
  }

  td {
    font-size: 14px;
  }

  td code {
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Quick Start */
  .quick-start {
    padding-left: var(--space-lg);
  }

  .quick-start li {
    margin-bottom: var(--space-sm);
  }

  .quick-start code {
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Setup boxes */
  .setup-box {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    margin: var(--space-md) 0;
  }

  .setup-cmd {
    display: block;
    font-size: 16px;
    font-weight: 600;
    color: var(--primary);
    margin-bottom: var(--space-sm);
  }

  .setup-box p {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
  }

  .setup-box p.note {
    margin-top: var(--space-md);
    font-style: italic;
  }

  .intro-text {
    color: var(--text-muted);
    margin-bottom: var(--space-md);
  }

  .install-box {
    border: 2px solid var(--primary);
    background: var(--bg-secondary);
  }

  .step-text {
    display: block;
    margin-bottom: var(--space-xs);
  }

  .step-code {
    display: block;
    background: var(--bg-tertiary);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 14px;
    margin: var(--space-xs) 0;
  }

  .step-note {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

  .success-check {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--success-bg, rgba(34, 197, 94, 0.1));
    border-radius: var(--radius-sm);
    color: var(--success);
    font-weight: 500;
  }

  /* Code blocks */
  .code-block {
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    margin: var(--space-md) 0;
    overflow-x: auto;
  }

  .code-block code {
    background: none;
    padding: 0;
  }

  /* Info box */
  .info-box {
    background: var(--info-bg);
    border-left: 4px solid var(--info);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    margin: var(--space-lg) 0;
    font-size: 14px;
  }

  .info-box strong {
    display: block;
    margin-bottom: var(--space-xs);
  }

  .info-box code {
    background: rgba(255,255,255,0.5);
    padding: 1px 4px;
    border-radius: 3px;
  }

  section h3 {
    font-size: 16px;
    margin: var(--space-lg) 0 var(--space-sm);
    color: var(--text);
  }

  /* Bug Capture Methods */
  .bug-capture-methods {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    margin: var(--space-md) 0;
  }

  .capture-method {
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border-left: 3px solid var(--primary);
  }

  .capture-method strong {
    display: block;
    font-size: 14px;
    margin-bottom: var(--space-xs);
  }

  .capture-method p {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  /* Severity Table */
  .severity-table {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin: var(--space-md) 0;
  }

  .severity-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }

  .severity-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
  }

  .severity-name {
    font-weight: 600;
    font-size: 13px;
    width: 70px;
  }

  .severity-desc {
    font-size: 13px;
    color: var(--text-muted);
  }

  .severity-row.critical {
    border-left: 3px solid #ef4444;
  }

  .severity-row.high {
    border-left: 3px solid #f97316;
  }

  .severity-row.medium {
    border-left: 3px solid #eab308;
  }

  .severity-row.low {
    border-left: 3px solid #22c55e;
  }

  /* Bugfix Section */
  .bugfix-flow {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin: var(--space-md) 0;
  }

  .bugfix-step {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--primary);
  }

  .bugfix-num {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    background: var(--primary);
    color: white;
    border-radius: 50%;
    font-size: 14px;
    font-weight: 700;
  }

  .bugfix-content {
    flex: 1;
  }

  .bugfix-content strong {
    display: block;
    font-size: 14px;
    margin-bottom: 2px;
  }

  .bugfix-content p {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .bugfix-rules {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    margin: var(--space-md) 0;
  }

  .rule {
    padding: var(--space-md);
    border-radius: var(--radius-lg);
  }

  .rule strong {
    display: block;
    font-size: 14px;
    margin-bottom: var(--space-sm);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .rule ul {
    margin: 0;
    padding-left: var(--space-lg);
    font-size: 13px;
  }

  .rule li {
    margin-bottom: var(--space-xs);
  }

  .rule-do {
    background: rgba(76, 175, 80, 0.1);
    border-left: 4px solid var(--success);
  }

  .rule-do strong {
    color: var(--success);
  }

  .rule-dont {
    background: rgba(244, 67, 54, 0.1);
    border-left: 4px solid var(--error);
  }

  .rule-dont strong {
    color: var(--error);
  }

  /* Doc Tabs */
  .doc-tabs {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-xl);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }

  .doc-tab {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .doc-tab:hover {
    background: var(--bg-tertiary);
    color: var(--text);
  }

  .doc-tab.active {
    background: var(--primary);
    color: white;
  }

  /* Docs Page */
  .docs-page {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: var(--space-xl);
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-xl);
    min-height: 100vh;
  }

  .doc-nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-md);
  }

  .doc-nav-item {
    padding: var(--space-sm) var(--space-md);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .doc-nav-item:hover {
    background: var(--bg-tertiary);
  }

  .doc-nav-item.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  /* Docs Content - Markdown Styling */
  .docs-content {
    max-width: 800px;
    line-height: 1.7;
  }

  .docs-content :global(h1) {
    font-size: 28px;
    margin: 0 0 var(--space-lg);
    padding-bottom: var(--space-sm);
    border-bottom: 2px solid var(--border);
  }

  .docs-content :global(h2) {
    font-size: 22px;
    margin: var(--space-2xl) 0 var(--space-md);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--border);
  }

  .docs-content :global(h3) {
    font-size: 18px;
    margin: var(--space-xl) 0 var(--space-sm);
  }

  .docs-content :global(p) {
    margin: 0 0 var(--space-md);
  }

  .docs-content :global(ul),
  .docs-content :global(ol) {
    margin: 0 0 var(--space-md);
    padding-left: var(--space-xl);
  }

  .docs-content :global(li) {
    margin-bottom: var(--space-xs);
  }

  .docs-content :global(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .docs-content :global(pre) {
    background: var(--bg-tertiary);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    overflow-x: auto;
    margin: 0 0 var(--space-md);
  }

  .docs-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .docs-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 var(--space-md);
  }

  .docs-content :global(th),
  .docs-content :global(td) {
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    border: 1px solid var(--border);
  }

  .docs-content :global(th) {
    background: var(--bg-secondary);
    font-weight: 600;
  }

  .docs-content :global(blockquote) {
    margin: 0 0 var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-left: 4px solid var(--primary);
    background: var(--bg-secondary);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .docs-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-xl) 0;
  }

  .docs-content :global(a) {
    color: var(--primary);
    text-decoration: none;
  }

  .docs-content :global(a:hover) {
    text-decoration: underline;
  }

  /* Troubleshooting */
  .trouble-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  .trouble-item {
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border-left: 4px solid var(--warning);
  }

  .trouble-item h3 {
    margin: 0 0 var(--space-sm);
    font-size: 14px;
    color: var(--text);
  }

  .trouble-item p {
    margin: 0 0 var(--space-xs);
    font-size: 13px;
    color: var(--text-muted);
  }

  .trouble-item .code-block {
    margin: var(--space-xs) 0 0;
    padding: var(--space-sm);
    font-size: 12px;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .guide-page {
      grid-template-columns: 1fr;
    }

    .quick-ref {
      position: relative;
      top: 0;
    }
  }

  @media (max-width: 600px) {
    .bugfix-rules {
      grid-template-columns: 1fr;
    }

    .bug-capture-methods {
      grid-template-columns: 1fr;
    }

    .severity-row {
      flex-wrap: wrap;
    }

    .severity-desc {
      width: 100%;
      margin-top: var(--space-xs);
    }
  }
</style>
