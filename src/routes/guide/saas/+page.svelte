<script lang="ts">
</script>

<div class="guide-page">
  <h1>Team & SaaS Setup</h1>
  <p class="lead">Set up chkd for your team with cloud-hosted features.</p>

  <div class="coming-soon">
    <h2>Coming Soon</h2>
    <p>The SaaS version of chkd is currently in development. Here's what to expect:</p>
  </div>

  <section>
    <h2>Planned Features</h2>

    <div class="feature-grid">
      <div class="feature-card">
        <h3>Team Workspaces</h3>
        <p>Invite team members, assign roles, and collaborate on specs together.</p>
      </div>
      <div class="feature-card">
        <h3>GitHub Integration</h3>
        <p>Connect your GitHub repos, auto-sync specs, and create PRs from workers.</p>
      </div>
      <div class="feature-card">
        <h3>Cloud Workers</h3>
        <p>Run Claude workers in the cloud without local infrastructure.</p>
      </div>
      <div class="feature-card">
        <h3>Analytics</h3>
        <p>Track velocity, time per task, and team productivity metrics.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Pricing Plans</h2>

    <div class="pricing-grid">
      <div class="pricing-card">
        <h3>Free</h3>
        <ul>
          <li>1 user</li>
          <li>2 repos</li>
          <li>60 worker minutes/mo</li>
        </ul>
      </div>
      <div class="pricing-card featured">
        <h3>Team</h3>
        <ul>
          <li>10 users</li>
          <li>10 repos</li>
          <li>500 worker minutes/mo</li>
          <li>GitHub integration</li>
        </ul>
      </div>
      <div class="pricing-card">
        <h3>Enterprise</h3>
        <ul>
          <li>Unlimited users</li>
          <li>Unlimited repos</li>
          <li>Custom worker minutes</li>
          <li>SSO & audit logs</li>
        </ul>
      </div>
    </div>
  </section>

  <section>
    <h2>Self-Hosted Option</h2>
    <p>Prefer to run your own infrastructure? chkd works great self-hosted:</p>
    <ul>
      <li>SQLite database (zero config)</li>
      <li>Local git worktrees for workers</li>
      <li>No external dependencies</li>
      <li>Full control over your data</li>
    </ul>
    <p>See the <a href="/guide/quickstart">Quick Start guide</a> for self-hosted setup.</p>
  </section>

  <div class="notify-box">
    <h3>Get Notified</h3>
    <p>Want to know when SaaS launches? Follow the project on GitHub for updates.</p>
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

  .coming-soon {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 40px;
  }

  .coming-soon h2 {
    color: var(--accent, #8b5cf6);
    margin-top: 0;
  }

  section {
    margin-bottom: 48px;
  }

  section h2 {
    font-size: 1.5rem;
    margin-bottom: 16px;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin: 20px 0;
  }

  .feature-card {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 20px;
  }

  .feature-card h3 {
    margin-top: 0;
    margin-bottom: 8px;
  }

  .feature-card p {
    margin: 0;
    color: var(--text-muted, #888);
    font-size: 14px;
  }

  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 20px 0;
  }

  .pricing-card {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 24px;
    text-align: center;
  }

  .pricing-card.featured {
    border-color: var(--accent, #8b5cf6);
    background: linear-gradient(180deg, rgba(139, 92, 246, 0.1), transparent);
  }

  .pricing-card h3 {
    margin-top: 0;
  }

  .pricing-card ul {
    list-style: none;
    padding: 0;
    margin: 16px 0 0;
    text-align: left;
  }

  .pricing-card li {
    padding: 8px 0;
    border-bottom: 1px solid var(--border, #222);
    font-size: 14px;
  }

  .pricing-card li:last-child {
    border-bottom: none;
  }

  ul {
    padding-left: 24px;
  }

  li {
    margin-bottom: 8px;
  }

  a {
    color: var(--accent, #8b5cf6);
  }

  .notify-box {
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }

  .notify-box h3 {
    margin-top: 0;
  }

  @media (max-width: 768px) {
    .feature-grid, .pricing-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
