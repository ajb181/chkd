<script lang="ts">
  import { onMount } from 'svelte';

  let hasApiKey = false;
  let apiKeyPreview = '';
  let newApiKey = '';
  let saving = false;
  let message = '';
  let messageType: 'success' | 'error' = 'success';
  let loading = true;

  onMount(async () => {
    await loadSettings();
  });

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
</style>
