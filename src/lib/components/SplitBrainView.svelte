<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Worker, ManagerSignal } from '$lib/api';
  import WorkerPanel from './WorkerPanel.svelte';

  export let workers: Worker[] = [];
  export let signals: ManagerSignal[] = [];
  export let repoName: string = '';

  const dispatch = createEventDispatcher();

  // Get the most recent/important signal
  $: topSignal = signals.length > 0 ? signals[0] : null;

  function handleDismissSignal(signalId: string) {
    dispatch('dismisssignal', { signalId });
  }

  function handleSignalAction(signal: ManagerSignal, action: string) {
    dispatch('signalaction', { signal, action });
  }

  function handleWorkerPause(e: CustomEvent) {
    dispatch('pauseworker', e.detail);
  }

  function handleWorkerResume(e: CustomEvent) {
    dispatch('resumeworker', e.detail);
  }

  function handleWorkerStop(e: CustomEvent) {
    dispatch('stopworker', e.detail);
  }

  function handleViewCode(e: CustomEvent) {
    dispatch('viewcode', e.detail);
  }

  function handleSpawnWorker() {
    dispatch('spawnworker');
  }
</script>

<div class="split-brain-view">
  <!-- Header -->
  <div class="view-header">
    <h2 class="view-title">
      <span class="repo-icon">📁</span>
      {repoName}
      <span class="worker-count">{workers.length} worker{workers.length !== 1 ? 's' : ''}</span>
    </h2>
    <button class="spawn-btn" on:click={handleSpawnWorker}>
      + Spawn Worker
    </button>
  </div>

  <!-- Manager Signal Bar -->
  {#if topSignal}
    <div class="manager-signal" class:help={topSignal.type === 'help'} class:warning={topSignal.type === 'warning'} class:decision={topSignal.type === 'decision'} class:info={topSignal.type === 'info'}>
      <div class="signal-header">
        <span class="signal-icon">🤖</span>
        <span class="signal-label">MANAGER</span>
        {#if topSignal.type === 'help'}
          <span class="signal-type-badge help">Needs Help</span>
        {:else if topSignal.type === 'warning'}
          <span class="signal-type-badge warning">Warning</span>
        {:else if topSignal.type === 'decision'}
          <span class="signal-type-badge decision">Decision Made</span>
        {/if}
      </div>
      <div class="signal-message">{topSignal.message}</div>
      {#if topSignal.actionRequired && topSignal.actionOptions && topSignal.actionOptions.length > 0}
        <div class="signal-actions">
          {#each topSignal.actionOptions as action}
            <button class="signal-action-btn" on:click={() => handleSignalAction(topSignal, action)}>{action}</button>
          {/each}
        </div>
      {/if}
      <button class="signal-dismiss" on:click={() => handleDismissSignal(topSignal.id)} title="Dismiss">
        Dismiss
      </button>
    </div>
  {:else}
    <div class="manager-signal info">
      <div class="signal-header">
        <span class="signal-icon">🤖</span>
        <span class="signal-label">MANAGER</span>
      </div>
      <div class="signal-message">
        {#if workers.length === 0}
          No workers active. Spawn a worker to start parallel development.
        {:else}
          {@const working = workers.filter(w => w.status === 'working').length}
          {@const merging = workers.filter(w => w.status === 'merging').length}
          {@const paused = workers.filter(w => w.status === 'paused').length}
          {#if paused > 0}
            ⚠️ {paused} worker{paused > 1 ? 's' : ''} paused and need{paused === 1 ? 's' : ''} attention.
          {:else if merging > 0}
            🟡 {merging} worker{merging > 1 ? 's' : ''} merging. {working} working.
          {:else}
            All {working} worker{working > 1 ? 's' : ''} progressing normally.
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Worker Panels Grid -->
  {#if workers.length > 0}
    <div class="workers-grid" class:single={workers.length === 1} class:double={workers.length === 2} class:multi={workers.length > 2}>
      {#each workers as worker (worker.id)}
        <WorkerPanel
          {worker}
          compact={workers.length > 2}
          on:pause={handleWorkerPause}
          on:resume={handleWorkerResume}
          on:stop={handleWorkerStop}
          on:viewcode={handleViewCode}
        />
      {/each}
    </div>
  {:else}
    <div class="no-workers">
      <div class="no-workers-icon">👷</div>
      <div class="no-workers-text">No workers active</div>
      <div class="no-workers-hint">Click "Spawn Worker" to create a parallel Claude worker</div>
    </div>
  {/if}

  <!-- Additional Signals (if more than one) -->
  {#if signals.length > 1}
    <div class="additional-signals">
      <div class="signals-header">
        <span class="signals-count">{signals.length - 1} more signal{signals.length > 2 ? 's' : ''}</span>
      </div>
      <div class="signals-list">
        {#each signals.slice(1, 4) as signal}
          <div class="signal-item" class:help={signal.type === 'help'} class:warning={signal.type === 'warning'}>
            <span class="signal-item-icon">
              {#if signal.type === 'help'}🆘{:else if signal.type === 'warning'}⚠️{:else if signal.type === 'decision'}✅{:else}ℹ️{/if}
            </span>
            <span class="signal-item-msg">{signal.message.length > 60 ? signal.message.slice(0, 57) + '...' : signal.message}</span>
            <button class="signal-item-dismiss" on:click={() => handleDismissSignal(signal.id)}>×</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .split-brain-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: var(--background);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .view-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .repo-icon {
    font-size: 18px;
  }

  .worker-count {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-muted);
    padding: 2px 8px;
    background: var(--surface-hover);
    border-radius: var(--radius-sm);
  }

  .spawn-btn {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    background: var(--success);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .spawn-btn:hover {
    background: var(--success-hover);
  }

  /* Manager Signal Bar */
  .manager-signal {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 16px;
  }

  .manager-signal.help {
    border-color: var(--error);
    background: var(--error-bg);
  }

  .manager-signal.warning {
    border-color: var(--warning);
    background: var(--warning-bg);
  }

  .manager-signal.decision {
    border-color: var(--success);
    background: var(--success-bg);
  }

  .signal-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .signal-icon {
    font-size: 14px;
  }

  .signal-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .signal-type-badge {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    margin-left: auto;
  }

  .signal-type-badge.help {
    background: var(--error);
    color: white;
  }

  .signal-type-badge.warning {
    background: var(--warning);
    color: white;
  }

  .signal-type-badge.decision {
    background: var(--success);
    color: white;
  }

  .signal-message {
    font-size: 13px;
    color: var(--text);
    line-height: 1.4;
  }

  .signal-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .signal-action-btn {
    padding: 6px 12px;
    font-size: 11px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .signal-action-btn:hover {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .signal-dismiss {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px 8px;
    font-size: 10px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .signal-dismiss:hover {
    color: var(--error);
  }

  /* Workers Grid */
  .workers-grid {
    display: grid;
    gap: 16px;
  }

  .workers-grid.single {
    grid-template-columns: 1fr;
    max-width: 400px;
  }

  .workers-grid.double {
    grid-template-columns: repeat(2, 1fr);
  }

  .workers-grid.multi {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }

  /* No Workers State */
  .no-workers {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: var(--surface);
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .no-workers-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .no-workers-text {
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 4px;
  }

  .no-workers-hint {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* Additional Signals */
  .additional-signals {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
  }

  .signals-header {
    margin-bottom: 8px;
  }

  .signals-count {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .signals-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .signal-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--surface-hover);
    border-radius: var(--radius-sm);
    font-size: 11px;
  }

  .signal-item.help {
    background: var(--error-bg);
  }

  .signal-item.warning {
    background: var(--warning-bg);
  }

  .signal-item-icon {
    font-size: 12px;
  }

  .signal-item-msg {
    flex: 1;
    color: var(--text);
  }

  .signal-item-dismiss {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 14px;
    line-height: 1;
  }

  .signal-item-dismiss:hover {
    color: var(--error);
  }
</style>
