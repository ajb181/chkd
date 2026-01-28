<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Worker, ManagerSignal } from '$lib/api';

  export let worker: Worker;
  export let signal: ManagerSignal;

  const dispatch = createEventDispatcher();

  let resolving = false;
  let selectedStrategy: 'ours' | 'theirs' | 'abort' | null = null;

  // Extract conflict details from signal
  $: conflicts = signal.details?.conflicts || [];
  $: branchName = signal.details?.branchName || worker.branchName;
  $: targetBranch = signal.details?.targetBranch || 'main';

  async function handleResolve(strategy: 'ours' | 'theirs' | 'abort') {
    selectedStrategy = strategy;
    resolving = true;

    dispatch('resolve', {
      workerId: worker.id,
      strategy,
      signalId: signal.id
    });
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="conflict-modal-overlay" on:click={handleCancel}>
  <div class="conflict-modal" on:click|stopPropagation>
    <div class="conflict-header">
      <div class="conflict-icon">⚠️</div>
      <div class="conflict-title">
        <h2>Merge Conflicts Detected</h2>
        <p class="conflict-subtitle">
          Worker {worker.taskId || worker.id.slice(0, 8)} needs help resolving conflicts
        </p>
      </div>
      <button class="close-btn" on:click={handleCancel}>×</button>
    </div>

    <div class="conflict-body">
      <!-- Branch Info -->
      <div class="branch-info">
        <div class="branch-item">
          <span class="branch-label">Worker Branch:</span>
          <code class="branch-name">{branchName}</code>
        </div>
        <div class="branch-arrow">→</div>
        <div class="branch-item">
          <span class="branch-label">Target Branch:</span>
          <code class="branch-name">{targetBranch}</code>
        </div>
      </div>

      <!-- Conflict List -->
      <div class="conflicts-section">
        <h3>Conflicting Files ({conflicts.length})</h3>
        <div class="conflicts-list">
          {#each conflicts as conflict}
            <div class="conflict-file">
              <span class="file-icon">📄</span>
              <span class="file-name">{conflict.file}</span>
              <span class="conflict-type">{conflict.type || 'modified'}</span>
            </div>
          {:else}
            <div class="no-conflicts">Conflict details not available</div>
          {/each}
        </div>
      </div>

      <!-- Resolution Options -->
      <div class="resolution-section">
        <h3>Choose Resolution Strategy</h3>
        <div class="resolution-options">
          <button
            class="resolution-btn ours"
            class:selected={selectedStrategy === 'ours'}
            disabled={resolving}
            on:click={() => handleResolve('ours')}
          >
            <div class="btn-icon">🧠</div>
            <div class="btn-content">
              <div class="btn-title">Keep Worker Changes</div>
              <div class="btn-desc">Use the worker's version of conflicting files</div>
            </div>
            {#if resolving && selectedStrategy === 'ours'}
              <div class="btn-loading">...</div>
            {/if}
          </button>

          <button
            class="resolution-btn theirs"
            class:selected={selectedStrategy === 'theirs'}
            disabled={resolving}
            on:click={() => handleResolve('theirs')}
          >
            <div class="btn-icon">🌿</div>
            <div class="btn-content">
              <div class="btn-title">Keep Main Changes</div>
              <div class="btn-desc">Discard worker's changes, keep {targetBranch} version</div>
            </div>
            {#if resolving && selectedStrategy === 'theirs'}
              <div class="btn-loading">...</div>
            {/if}
          </button>

          <button
            class="resolution-btn abort"
            class:selected={selectedStrategy === 'abort'}
            disabled={resolving}
            on:click={() => handleResolve('abort')}
          >
            <div class="btn-icon">🚫</div>
            <div class="btn-content">
              <div class="btn-title">Abort Merge</div>
              <div class="btn-desc">Cancel the merge, worker will pause</div>
            </div>
            {#if resolving && selectedStrategy === 'abort'}
              <div class="btn-loading">...</div>
            {/if}
          </button>
        </div>
      </div>

      <!-- Help Text -->
      <div class="help-text">
        <p>
          <strong>Tip:</strong> If unsure, choose "Keep Worker Changes" to preserve the worker's
          implementation. You can always review and adjust later.
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  .conflict-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .conflict-modal {
    background: var(--surface);
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 560px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
  }

  .conflict-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 20px;
    border-bottom: 1px solid var(--border);
    background: var(--warning-bg);
  }

  .conflict-icon {
    font-size: 32px;
  }

  .conflict-title {
    flex: 1;
  }

  .conflict-title h2 {
    margin: 0 0 4px 0;
    font-size: 18px;
    color: var(--text);
  }

  .conflict-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 24px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .conflict-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Branch Info */
  .branch-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface-hover);
    border-radius: var(--radius);
  }

  .branch-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .branch-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .branch-name {
    font-size: 12px;
    background: var(--surface);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .branch-arrow {
    font-size: 16px;
    color: var(--text-muted);
  }

  /* Conflicts Section */
  .conflicts-section h3,
  .resolution-section h3 {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .conflicts-list {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-height: 150px;
    overflow-y: auto;
  }

  .conflict-file {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  .conflict-file:last-child {
    border-bottom: none;
  }

  .file-icon {
    font-size: 14px;
  }

  .file-name {
    flex: 1;
    font-size: 12px;
    font-family: monospace;
    color: var(--text);
  }

  .conflict-type {
    font-size: 10px;
    color: var(--warning);
    background: var(--warning-bg);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .no-conflicts {
    padding: 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }

  /* Resolution Options */
  .resolution-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .resolution-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface-hover);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .resolution-btn:hover:not(:disabled) {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .resolution-btn.selected {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .resolution-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .resolution-btn.ours:hover:not(:disabled),
  .resolution-btn.ours.selected {
    border-color: var(--success);
    background: var(--success-bg);
  }

  .resolution-btn.theirs:hover:not(:disabled),
  .resolution-btn.theirs.selected {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .resolution-btn.abort:hover:not(:disabled),
  .resolution-btn.abort.selected {
    border-color: var(--warning);
    background: var(--warning-bg);
  }

  .btn-icon {
    font-size: 24px;
  }

  .btn-content {
    flex: 1;
  }

  .btn-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 2px;
  }

  .btn-desc {
    font-size: 11px;
    color: var(--text-muted);
  }

  .btn-loading {
    font-size: 14px;
    color: var(--primary);
  }

  /* Help Text */
  .help-text {
    background: var(--surface-hover);
    padding: 12px;
    border-radius: var(--radius);
    border-left: 3px solid var(--primary);
  }

  .help-text p {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .help-text strong {
    color: var(--text);
  }
</style>
