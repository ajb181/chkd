<script lang="ts">
</script>

<div class="guide-page">
  <h1>Skills Reference</h1>
  <p class="lead">Built-in skills that enhance your chkd workflow.</p>

  <section>
    <h2>What are Skills?</h2>
    <p>Skills are specialized prompts that guide Claude through specific workflows. They're invoked with a slash command (e.g., <code>/commit</code>) and provide structured processes for common tasks.</p>
  </section>

  <section>
    <h2>Core Skills</h2>

    <div class="skill">
      <div class="skill-header">
        <code>/chkd</code>
        <span class="usage">/chkd SD.1</span>
      </div>
      <p>Build a specific task from your spec. This is the primary way to work on features - it starts a session, sets the anchor, and guides you through the 6-phase workflow.</p>
      <div class="phases">
        <span>Assess</span>
        <span>Explore</span>
        <span>Plan</span>
        <span>Build</span>
        <span>Verify</span>
        <span>Close</span>
      </div>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/story</code>
        <span class="usage">/story</span>
      </div>
      <p>Develop a feature story through deep questioning. Use this before building to refine requirements, uncover edge cases, and create a solid spec. Great for complex features.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/bugfix</code>
        <span class="usage">/bugfix login timeout</span>
      </div>
      <p>Fix a bug with minimal changes. Emphasizes research first, then targeted fixes. Prevents scope creep and ensures you understand the root cause before changing code.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/commit</code>
        <span class="usage">/commit</span>
      </div>
      <p>Safe commit workflow with build verification. Checks for uncommitted changes, runs the build, and creates a well-formatted commit. Never pushes or creates PRs automatically.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/retro</code>
        <span class="usage">/retro</span>
      </div>
      <p>Capture learnings after fixing bugs or completing features. Reviews what happened, what was learned, and updates skills for continuous improvement.</p>
    </div>
  </section>

  <section>
    <h2>Code Quality Skills</h2>

    <div class="skill">
      <div class="skill-header">
        <code>/test</code>
        <span class="usage">/test</span>
      </div>
      <p>Run tests intelligently based on scope. Determines which tests are relevant to your changes and runs them appropriately.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/security-review</code>
        <span class="usage">/security-review</span>
      </div>
      <p>Review code for security vulnerabilities. Checks for common issues like injection, XSS, and authentication problems.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/code-health</code>
        <span class="usage">/code-health</span>
      </div>
      <p>Check codebase for architecture compliance issues. Identifies patterns that don't match your established conventions.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/component-check</code>
        <span class="usage">/component-check Button.svelte</span>
      </div>
      <p>Analyze a React/Svelte component for extraction opportunities. Identifies reusable patterns that could become shared components.</p>
    </div>
  </section>

  <section>
    <h2>Discovery Skills</h2>

    <div class="skill">
      <div class="skill-header">
        <code>/find-function</code>
        <span class="usage">/find-function formatDate</span>
      </div>
      <p>Search for existing functions before writing new ones. Prevents duplicate implementations and helps you reuse existing code.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/check-function</code>
        <span class="usage">/check-function</span>
      </div>
      <p>Verify a new function isn't duplicating existing code. Run this after writing a utility to check for redundancy.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/query-check</code>
        <span class="usage">/query-check</span>
      </div>
      <p>Analyze Prisma queries for performance issues. Checks for N+1 problems, missing indexes, and inefficient patterns.</p>
    </div>
  </section>

  <section>
    <h2>Planning Skills</h2>

    <div class="skill">
      <div class="skill-header">
        <code>/interview</code>
        <span class="usage">/interview</span>
      </div>
      <p>Deep interview before building. Asks extensive questions to discover requirements, constraints, and edge cases before any code is written.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/sceptic</code>
        <span class="usage">/sceptic</span>
      </div>
      <p>Critical product/feature validation. Researches competitors, challenges assumptions, and helps decide if a feature is worth building.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/merge-prep</code>
        <span class="usage">/merge-prep</span>
      </div>
      <p>Prepare a feature branch for safe merge. Checks schema changes, runs tests, and creates a backup before merging to main.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/pr</code>
        <span class="usage">/pr</span>
      </div>
      <p>Safe commit and PR workflow. Creates a well-documented pull request without committing to the wrong branch.</p>
    </div>
  </section>

  <section>
    <h2>Story & Epic Skills</h2>

    <div class="skill">
      <div class="skill-header">
        <code>/epic</code>
        <span class="usage">/epic</span>
      </div>
      <p>Plan and create a large feature. Uses interview → design → stories workflow to break down complex work.</p>
    </div>

    <div class="skill">
      <div class="skill-header">
        <code>/interview</code>
        <span class="usage">/interview</span>
      </div>
      <p>Deep interview before building. Discover requirements through extensive questioning.</p>
    </div>
  </section>

  <section>
    <h2>Using Skills</h2>
    <p>To use a skill, type the command in your Claude Code session:</p>
    <div class="code-block"><pre><code># Build a feature
/chkd SD.3

# Fix a bug
/bugfix "save button not working"

# Commit your changes
/commit</code></pre></div>

    <p>Skills are context-aware and will adapt to your current project and task.</p>
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

  section > p {
    margin-bottom: 24px;
    line-height: 1.6;
  }

  section h2 {
    font-size: 1.5rem;
    margin-bottom: 20px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #333);
  }

  .skill {
    margin-bottom: 20px;
    padding: 20px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
  }

  .skill-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }

  .skill-header code {
    font-size: 1.1rem;
    color: var(--accent, #8b5cf6);
    background: none;
    padding: 0;
  }

  .usage {
    font-size: 13px;
    color: var(--text-muted, #666);
    font-family: 'SF Mono', Consolas, monospace;
  }

  .skill p {
    margin: 0;
    color: var(--text-muted, #ccc);
    line-height: 1.6;
  }

  .phases {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .phases span {
    font-size: 11px;
    padding: 4px 8px;
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
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
</style>
