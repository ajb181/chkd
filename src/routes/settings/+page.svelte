<script lang="ts">
  import { onMount } from 'svelte';

  // API Key state
  let hasApiKey = false;
  let apiKeyPreview = '';
  let newApiKey = '';

  // Theme state
  let theme: 'system' | 'light' | 'dark' = 'system';

  // Repos state
  interface Repo {
    id: string;
    name: string;
    path: string;
    enabled: boolean;
  }
  let repos: Repo[] = [];
  let newRepoPath = '';
  let addingRepo = false;

  // LLM Personalization
  let llmTone: 'default' | 'formal' | 'casual' | 'concise' = 'default';
  let llmCustomPrefix = '';
  let savingLlm = false;

  // General state
  let saving = false;
  let message = '';
  let messageType: 'success' | 'error' = 'success';
  let loading = true;

  onMount(async () => {
    // Load saved theme preference
    const savedTheme = localStorage.getItem('chkd-theme') as 'system' | 'light' | 'dark' | null;
    if (savedTheme) {
      theme = savedTheme;
      applyTheme(theme);
    }

    await loadSettings();
    await loadRepos();
    await loadLlmSettings();
  });

  function applyTheme(newTheme: 'system' | 'light' | 'dark') {
    const root = document.documentElement;

    if (newTheme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', newTheme);
    }

    localStorage.setItem('chkd-theme', newTheme);
  }

  function handleThemeChange() {
    applyTheme(theme);
  }

  async function loadRepos() {
    try {
      const res = await fetch('/api/repos');
      const data = await res.json();
      if (data.success) {
        repos = data.data || [];
      }
    } catch (e) {
      console.error('Failed to load repos:', e);
    }
  }

  async function addRepo() {
    if (!newRepoPath.trim()) return;

    addingRepo = true;
    message = '';

    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newRepoPath.trim() })
      });

      const data = await res.json();

      if (data.success) {
        message = `Repository added: ${data.data.name}`;
        messageType = 'success';
        newRepoPath = '';
        await loadRepos();
      } else {
        message = data.error || 'Failed to add repository';
        messageType = 'error';
      }
    } catch (e) {
      message = 'Failed to add repository';
      messageType = 'error';
    }

    addingRepo = false;
  }

  async function removeRepo(repoId: string) {
    if (!confirm('Are you sure you want to remove this repository?')) return;

    try {
      const res = await fetch(`/api/repos?id=${repoId}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        message = 'Repository removed';
        messageType = 'success';
        await loadRepos();
      } else {
        message = data.error || 'Failed to remove repository';
        messageType = 'error';
      }
    } catch (e) {
      message = 'Failed to remove repository';
      messageType = 'error';
    }
  }

  async function loadSettings() {
    loading = true;
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      hasApiKey = data.data.hasApiKey;
      apiKeyPreview = data.data.apiKeyPreview || '';
    }
    loading = false;
  }

  async function saveApiKey() {
    if (!newApiKey.trim()) return;

    saving = true;
    message = '';

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: newApiKey.trim() })
    });

    const data = await res.json();

    if (data.success) {
      message = 'API key saved successfully!';
      messageType = 'success';
      newApiKey = '';
      await loadSettings();
    } else {
      message = data.error || 'Failed to save API key';
      messageType = 'error';
    }

    saving = false;
  }

  async function clearApiKey() {
    if (!confirm('Are you sure you want to remove the API key?')) return;

    saving = true;
    message = '';

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '' })
    });

    const data = await res.json();

    if (data.success) {
      message = 'API key removed';
      messageType = 'success';
      await loadSettings();
    } else {
      message = data.error || 'Failed to remove API key';
      messageType = 'error';
    }

    saving = false;
  }

  async function loadLlmSettings() {
    try {
      const res = await fetch('/api/settings/llm');
      const data = await res.json();
      if (data.success) {
        llmTone = data.data.tone || 'default';
        llmCustomPrefix = data.data.customPrefix || '';
      }
    } catch (e) {
      console.error('Failed to load LLM settings:', e);
    }
  }

  async function saveLlmSettings() {
    savingLlm = true;
    message = '';

    try {
      const res = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone: llmTone,
          customPrefix: llmCustomPrefix
        })
      });

      const data = await res.json();

      if (data.success) {
        message = 'LLM settings saved!';
        messageType = 'success';
      } else {
        message = data.error || 'Failed to save LLM settings';
        messageType = 'error';
      }
    } catch (e) {
      message = 'Failed to save LLM settings';
      messageType = 'error';
    }

    savingLlm = false;
  }
</script>

<header class="page-header">
  <div class="header-left">
    <a href="/" class="nav-link back-link">← Back</a>
  </div>
  <div class="header-center">
    <span class="page-title">Settings</span>
  </div>
  <div class="header-right"></div>
</header>

<main class="settings-page">
  <section class="settings-section">
    <h2>API Key</h2>
    <p class="section-desc">
      An Anthropic API key enables AI-powered features like smart feature expansion and duplicate detection.
    </p>

    {#if loading}
      <div class="loading">Loading...</div>
    {:else}
      <div class="api-key-status">
        {#if hasApiKey}
          <div class="status-badge success">API Key Configured</div>
          <div class="key-preview">{apiKeyPreview}</div>
          <button class="btn-danger" on:click={clearApiKey} disabled={saving}>
            Remove Key
          </button>
        {:else}
          <div class="status-badge warning">No API Key</div>
          <p class="no-key-note">AI features will use simple templates instead.</p>
        {/if}
      </div>

      <div class="api-key-form">
        <label for="api-key">
          {hasApiKey ? 'Replace API Key' : 'Add API Key'}
        </label>
        <div class="input-row">
          <input
            id="api-key"
            type="password"
            bind:value={newApiKey}
            placeholder="sk-ant-..."
            class="form-input"
          />
          <button
            class="btn-primary"
            on:click={saveApiKey}
            disabled={saving || !newApiKey.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p class="input-help">
          Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>
        </p>
      </div>

      {#if message}
        <div class="message" class:success={messageType === 'success'} class:error={messageType === 'error'}>
          {message}
        </div>
      {/if}
    {/if}
  </section>

  <section class="settings-section">
    <h2>Theme</h2>
    <p class="section-desc">
      Choose your preferred color scheme.
    </p>

    <div class="theme-options">
      <label class="theme-option" class:selected={theme === 'system'}>
        <input
          type="radio"
          name="theme"
          value="system"
          bind:group={theme}
          on:change={handleThemeChange}
        />
        <span class="theme-icon">💻</span>
        <span class="theme-label">System</span>
        <span class="theme-desc">Match your OS setting</span>
      </label>

      <label class="theme-option" class:selected={theme === 'light'}>
        <input
          type="radio"
          name="theme"
          value="light"
          bind:group={theme}
          on:change={handleThemeChange}
        />
        <span class="theme-icon">☀️</span>
        <span class="theme-label">Light</span>
        <span class="theme-desc">Always use light mode</span>
      </label>

      <label class="theme-option" class:selected={theme === 'dark'}>
        <input
          type="radio"
          name="theme"
          value="dark"
          bind:group={theme}
          on:change={handleThemeChange}
        />
        <span class="theme-icon">🌙</span>
        <span class="theme-label">Dark</span>
        <span class="theme-desc">Always use dark mode</span>
      </label>
    </div>
  </section>

  <section class="settings-section">
    <h2>AI Personalization</h2>
    <p class="section-desc">
      Customize how the AI generates content for features, bugs, and quick wins.
    </p>

    <div class="llm-setting">
      <label for="llm-tone">Response Tone</label>
      <select id="llm-tone" class="form-select" bind:value={llmTone}>
        <option value="default">Default</option>
        <option value="formal">Formal</option>
        <option value="casual">Casual</option>
        <option value="concise">Concise</option>
      </select>
      <p class="input-help">
        Formal: Professional language. Casual: Friendly tone. Concise: Shorter responses.
      </p>
    </div>

    <div class="llm-setting">
      <label for="llm-prefix">Custom Instructions</label>
      <textarea
        id="llm-prefix"
        class="form-textarea"
        bind:value={llmCustomPrefix}
        placeholder="Add custom instructions for AI responses... e.g., 'Always use TypeScript types' or 'Prefer functional components'"
        rows="3"
      ></textarea>
      <p class="input-help">
        These instructions will be added to all AI prompts for feature creation, bug processing, etc.
      </p>
    </div>

    <button
      class="btn-primary"
      on:click={saveLlmSettings}
      disabled={savingLlm}
    >
      {savingLlm ? 'Saving...' : 'Save AI Settings'}
    </button>
  </section>

  <section class="settings-section">
    <h2>Repositories</h2>
    <p class="section-desc">
      Manage the repositories chkd tracks.
    </p>

    <div class="repos-list">
      {#if repos.length === 0}
        <div class="no-repos">No repositories configured yet.</div>
      {:else}
        {#each repos as repo}
          <div class="repo-item">
            <div class="repo-info">
              <span class="repo-name">{repo.name}</span>
              <span class="repo-path">{repo.path}</span>
            </div>
            <button class="btn-icon" on:click={() => removeRepo(repo.id)} title="Remove repository">
              ✕
            </button>
          </div>
        {/each}
      {/if}
    </div>

    <div class="add-repo-form">
      <label for="repo-path">Add Repository</label>
      <div class="input-row">
        <input
          id="repo-path"
          type="text"
          bind:value={newRepoPath}
          placeholder="/path/to/your/project"
          class="form-input"
        />
        <button
          class="btn-primary"
          on:click={addRepo}
          disabled={addingRepo || !newRepoPath.trim()}
        >
          {addingRepo ? 'Adding...' : 'Add'}
        </button>
      </div>
      <p class="input-help">
        Enter the full path to a git repository. Run <code>chkd init</code> in the repo first.
      </p>
    </div>
  </section>

  <section class="settings-section">
    <h2>About chkd</h2>
    <p class="section-desc">
      chkd helps you build software with Claude Code without losing control.
    </p>
    <ul class="about-list">
      <li>Holds your spec as source of truth</li>
      <li>Tracks what gets built</li>
      <li>Keeps Claude focused on the plan</li>
      <li>Logs off-plan work as "Also did"</li>
    </ul>
  </section>
</main>

<style>
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

  .header-center {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .page-title {
    font-weight: 600;
    font-size: 16px;
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

  .settings-page {
    max-width: 600px;
    margin: 0 auto;
    padding: var(--space-xl);
  }

  .settings-section {
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .settings-section h2 {
    margin: 0 0 var(--space-sm);
    font-size: 18px;
  }

  .section-desc {
    color: var(--text-muted);
    font-size: 14px;
    margin: 0 0 var(--space-lg);
  }

  .loading {
    color: var(--text-muted);
    font-style: italic;
  }

  .api-key-status {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    padding: var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
  }

  .status-badge {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
  }

  .status-badge.success {
    background: var(--success);
    color: white;
  }

  .status-badge.warning {
    background: var(--warning);
    color: #333;
  }

  .key-preview {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-muted);
    flex: 1;
  }

  .no-key-note {
    flex: 1;
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .api-key-form {
    margin-top: var(--space-lg);
  }

  .api-key-form label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-sm);
    color: var(--text-muted);
  }

  .input-row {
    display: flex;
    gap: var(--space-sm);
  }

  .form-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
  }

  .form-input:focus {
    border-color: var(--primary);
    outline: none;
  }

  .input-help {
    margin: var(--space-sm) 0 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  .input-help a {
    color: var(--primary);
  }

  .btn-primary {
    padding: var(--space-sm) var(--space-lg);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    color: var(--error);
    border: 1px solid var(--error);
    border-radius: var(--radius-md);
    font-size: 13px;
    cursor: pointer;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--error);
    color: white;
  }

  .message {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 14px;
  }

  .message.success {
    background: rgba(76, 175, 80, 0.1);
    color: var(--success);
  }

  .message.error {
    background: rgba(244, 67, 54, 0.1);
    color: var(--error);
  }

  .about-list {
    margin: 0;
    padding-left: var(--space-lg);
    font-size: 14px;
    color: var(--text-muted);
  }

  .about-list li {
    margin-bottom: var(--space-xs);
  }

  /* Theme Options */
  .theme-options {
    display: flex;
    gap: var(--space-md);
  }

  .theme-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-lg) var(--space-md);
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .theme-option:hover {
    border-color: var(--primary);
  }

  .theme-option.selected {
    border-color: var(--primary);
    background: rgba(99, 102, 241, 0.05);
  }

  .theme-option input {
    display: none;
  }

  .theme-icon {
    font-size: 24px;
    margin-bottom: var(--space-sm);
  }

  .theme-label {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 2px;
  }

  .theme-desc {
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
  }

  /* Repositories */
  .repos-list {
    margin-bottom: var(--space-lg);
  }

  .no-repos {
    padding: var(--space-lg);
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
    background: var(--bg);
    border-radius: var(--radius-md);
  }

  .repo-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
  }

  .repo-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .repo-name {
    font-weight: 600;
    font-size: 14px;
  }

  .repo-path {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .btn-icon {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .btn-icon:hover {
    background: var(--bg-tertiary);
    color: var(--error);
  }

  .add-repo-form {
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .add-repo-form label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-sm);
    color: var(--text-muted);
  }

  /* LLM Settings */
  .llm-setting {
    margin-bottom: var(--space-lg);
  }

  .llm-setting label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-sm);
    color: var(--text-muted);
  }

  .form-select {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }

  .form-select:focus {
    border-color: var(--primary);
    outline: none;
  }

  .form-textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    resize: vertical;
    font-family: inherit;
  }

  .form-textarea:focus {
    border-color: var(--primary);
    outline: none;
  }
</style>
