<script lang="ts">
  import { onMount } from 'svelte';

  // Get repoPath from URL params (e.g., /ideas?repo=/path/to/repo)
  let repoPath = '';
  let loading = false;
  let submitted = false;
  let error = '';
  let submittedId = '';

  // Form fields
  let title = '';
  let description = '';
  let email = '';

  // My ideas (tracked by email)
  let myIdeas: any[] = [];
  let showMyIdeas = false;

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    repoPath = params.get('repo') || '';
    const emailParam = params.get('email');
    if (emailParam) {
      email = emailParam;
      loadMyIdeas();
    }
  });

  async function loadMyIdeas() {
    if (!repoPath || !email) return;

    try {
      const res = await fetch(`/api/ideas?repoPath=${encodeURIComponent(repoPath)}`);
      const data = await res.json();
      if (data.success) {
        myIdeas = data.data.filter((i: any) =>
          i.submitterEmail?.toLowerCase() === email.toLowerCase()
        );
      }
    } catch (e) {
      console.error('Failed to load ideas:', e);
    }
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      error = 'Please fill in both title and description';
      return;
    }

    if (!repoPath) {
      error = 'No project specified. Please use the link provided by your team.';
      return;
    }

    loading = true;
    error = '';

    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath,
          title: title.trim(),
          description: description.trim(),
          submitterEmail: email.trim() || undefined
        })
      });

      const data = await res.json();

      if (data.success) {
        submitted = true;
        submittedId = data.data.id;
        // Reset form
        title = '';
        description = '';
        // Reload my ideas if email provided
        if (email) {
          await loadMyIdeas();
        }
      } else {
        error = data.error || 'Failed to submit idea';
      }
    } catch (e) {
      error = 'Failed to submit idea. Please try again.';
    } finally {
      loading = false;
    }
  }

  function submitAnother() {
    submitted = false;
    submittedId = '';
    error = '';
  }

  const statusLabels: Record<string, string> = {
    submitted: 'Pending Review',
    reviewing: 'Under Review',
    approved: 'Approved',
    rejected: 'Not Accepted'
  };

  const statusColors: Record<string, string> = {
    submitted: '#666',
    reviewing: '#f59e0b',
    approved: '#10b981',
    rejected: '#ef4444'
  };
</script>

<svelte:head>
  <title>Submit Feature Idea</title>
</svelte:head>

<div class="page">
  <div class="container">
    <header>
      <h1>Submit a Feature Idea</h1>
      <p class="subtitle">
        Have an idea for improving this project? We'd love to hear it!
        Your suggestion will be reviewed by the development team.
      </p>
    </header>

    {#if !repoPath}
      <div class="error-box">
        <h2>Link Required</h2>
        <p>
          This page requires a project link. Please use the submission link
          provided by your development team.
        </p>
      </div>
    {:else if submitted}
      <div class="success-box">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2>Idea Submitted!</h2>
        <p>Thank you for your suggestion. The team will review it soon.</p>
        <p class="idea-id">Reference ID: <code>{submittedId}</code></p>
        {#if email}
          <p class="track-note">
            You can track your idea's status by visiting this page with your email.
          </p>
        {/if}
        <button class="btn-primary" on:click={submitAnother}>
          Submit Another Idea
        </button>
      </div>
    {:else}
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="title">Idea Title *</label>
          <input
            id="title"
            type="text"
            bind:value={title}
            placeholder="A short, descriptive title for your idea"
            disabled={loading}
            required
          />
        </div>

        <div class="form-group">
          <label for="description">Description *</label>
          <textarea
            id="description"
            bind:value={description}
            placeholder="Describe your idea in detail. What problem does it solve? How should it work?"
            rows="6"
            disabled={loading}
            required
          ></textarea>
        </div>

        <div class="form-group">
          <label for="email">Your Email (optional)</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="your@email.com"
            disabled={loading}
          />
          <p class="help-text">
            Provide your email to track your idea's status and receive updates.
          </p>
        </div>

        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Idea'}
        </button>
      </form>
    {/if}

    {#if email && myIdeas.length > 0}
      <div class="my-ideas">
        <button
          class="toggle-ideas"
          on:click={() => showMyIdeas = !showMyIdeas}
        >
          {showMyIdeas ? 'Hide' : 'Show'} My Ideas ({myIdeas.length})
        </button>

        {#if showMyIdeas}
          <div class="ideas-list">
            {#each myIdeas as idea}
              <div class="idea-card">
                <div class="idea-header">
                  <span class="idea-title">{idea.title}</span>
                  <span
                    class="status-badge"
                    style="background: {statusColors[idea.status]}"
                  >
                    {statusLabels[idea.status]}
                  </span>
                </div>
                {#if idea.feedback}
                  <div class="idea-feedback">
                    <strong>Feedback:</strong> {idea.feedback}
                  </div>
                {/if}
                {#if idea.promotedTo}
                  <div class="idea-promoted">
                    Added to development plan: {idea.promotedTo}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <footer>
      <p>
        Ideas are reviewed regularly. Not all ideas will be implemented,
        but all are considered carefully.
      </p>
    </footer>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #f8fafc;
    padding: 40px 20px;
  }

  .container {
    max-width: 600px;
    margin: 0 auto;
  }

  header {
    text-align: center;
    margin-bottom: 32px;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 12px 0;
  }

  .subtitle {
    color: #64748b;
    font-size: 16px;
    line-height: 1.5;
    margin: 0;
  }

  form {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 6px;
    font-size: 14px;
  }

  input, textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 15px;
    font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }

  input:focus, textarea:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  textarea {
    resize: vertical;
    min-height: 120px;
  }

  .help-text {
    font-size: 13px;
    color: #6b7280;
    margin: 6px 0 0 0;
  }

  .error-message {
    background: #fef2f2;
    color: #dc2626;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
  }

  .btn-primary {
    width: 100%;
    padding: 14px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-box, .success-box {
    background: white;
    border-radius: 12px;
    padding: 32px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .error-box {
    border: 2px solid #fecaca;
  }

  .error-box h2 {
    color: #dc2626;
  }

  .success-box {
    border: 2px solid #bbf7d0;
  }

  .success-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    color: #10b981;
  }

  .success-icon svg {
    width: 100%;
    height: 100%;
  }

  .success-box h2 {
    color: #059669;
    margin: 0 0 8px 0;
  }

  .success-box p {
    color: #64748b;
    margin: 0 0 12px 0;
  }

  .idea-id {
    font-size: 14px;
  }

  .idea-id code {
    background: #f1f5f9;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
  }

  .track-note {
    font-size: 13px;
    color: #6b7280;
  }

  .success-box .btn-primary {
    margin-top: 20px;
    width: auto;
    padding: 12px 24px;
  }

  .my-ideas {
    margin-top: 32px;
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .toggle-ideas {
    width: 100%;
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: background 0.15s;
  }

  .toggle-ideas:hover {
    background: #f1f5f9;
  }

  .ideas-list {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .idea-card {
    padding: 12px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .idea-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .idea-title {
    font-weight: 600;
    color: #1e293b;
    font-size: 14px;
  }

  .status-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: white;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .idea-feedback, .idea-promoted {
    margin-top: 8px;
    font-size: 13px;
    color: #64748b;
  }

  .idea-promoted {
    color: #059669;
  }

  footer {
    margin-top: 32px;
    text-align: center;
  }

  footer p {
    font-size: 13px;
    color: #94a3b8;
  }
</style>
