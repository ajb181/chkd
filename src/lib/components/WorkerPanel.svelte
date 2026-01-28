<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Worker } from '$lib/api';

  export let worker: Worker;
  export let compact = false;

  const dispatch = createEventDispatcher();

  // Format elapsed time
  function formatElapsed(startedAt: string | null): string {
    if (!startedAt) return '0m';
    const start = new Date(startedAt + 'Z').getTime();
    const elapsed = Date.now() - start;
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  // Get status emoji
  function getStatusEmoji(status: string): string {
    switch (status) {
      case 'working': return '🟢';
      case 'merging': return '🟡';
      case 'paused': return '⚠️';
      case 'error': return '🔴';
      case 'merged': return '✅';
      case 'pending': return '⏳';
      case 'waiting': return '⏸️';
      default: return '⚪';
    }
  }

  // Get status label
  function getStatusLabel(status: string): string {
    switch (status) {
      case 'working': return 'Working';
      case 'merging': return 'Merging';
      case 'paused': return 'Paused';
      case 'error': return 'Error';
      case 'merged': return 'Merged';
      case 'pending': return 'Pending';
      case 'waiting': return 'Waiting';
      default: return status;
    }
  }

  function handlePause() {
    dispatch('pause', { workerId: worker.id });
  }

  function handleResume() {
    dispatch('resume', { workerId: worker.id });
  }

  function handleStop() {
    dispatch('stop', { workerId: worker.id });
  }

  function handleViewCode() {
    dispatch('viewcode', { workerId: worker.id, worktreePath: worker.worktreePath });
  }
</script>

<div class="worker-panel" class:compact class:working={worker.status === 'working'} class:merging={worker.status === 'merging'} class:paused={worker.status === 'paused'} class:error={worker.status === 'error'}>
  <div class="worker-header">
    <span class="worker-icon">🧠</span>
    <span class="worker-label">WORKER</span>
    <span class="worker-id">{worker.taskId || worker.id.slice(0, 8)}</span>
    <span class="worker-status-badge" class:working={worker.status === 'working'} class:merging={worker.status === 'merging'} class:paused={worker.status === 'paused'} class:error={worker.status === 'error'}>
      {getStatusEmoji(worker.status)} {getStatusLabel(worker.status)}
    </span>
  </div>

  <div class="worker-content">
    <!-- Current Task -->
    <div class="worker-section">
      <div class="section-label">
        {#if worker.status === 'merged'}✅ COMPLETED{:else}📌 CURRENT{/if}
      </div>
      <div class="task-title">{worker.taskTitle || 'No task assigned'}</div>
      {#if worker.status !== 'merged'}
        <div class="progress-bar">
          <div class="progress-fill" style="width: {worker.progress}%"></div>
        </div>
        <div class="progress-text">{worker.progress}%</div>
      {/if}
    </div>

    <!-- Status Message -->
    {#if worker.message}
      <div class="worker-section">
        <div class="status-message">
          💭 "{worker.message}"
        </div>
      </div>
    {/if}

    <!-- Elapsed Time -->
    {#if worker.startedAt && !compact}
      <div class="worker-section">
        <div class="elapsed-time">
          ⏱️ {formatElapsed(worker.startedAt)} elapsed
        </div>
      </div>
    {/if}

    <!-- Next Task in Queue -->
    {#if worker.nextTaskId && worker.nextTaskTitle && !compact}
      <div class="worker-section next-section">
        <div class="section-label">📋 NEXT IN QUEUE</div>
        <div class="next-task">
          <span class="next-task-id">{worker.nextTaskId}</span>
          <span class="next-task-title">{worker.nextTaskTitle}</span>
        </div>
      </div>
    {/if}

    <!-- Actions -->
    {#if !compact}
      <div class="worker-actions">
        {#if worker.status === 'working'}
          <button class="action-btn pause" on:click={handlePause}>Pause</button>
        {:else if worker.status === 'paused'}
          <button class="action-btn resume" on:click={handleResume}>Resume</button>
        {/if}
        {#if worker.status !== 'merged' && worker.status !== 'cancelled'}
          <button class="action-btn stop" on:click={handleStop}>Stop</button>
        {/if}
        {#if worker.worktreePath}
          <button class="action-btn view" on:click={handleViewCode}>View Code</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .worker-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 280px;
    flex: 1;
  }

  .worker-panel.compact {
    min-width: 200px;
    padding: 8px;
  }

  .worker-panel.working {
    border-color: var(--success);
  }

  .worker-panel.merging {
    border-color: var(--warning);
  }

  .worker-panel.paused {
    border-color: var(--warning);
    background: var(--warning-bg);
  }

  .worker-panel.error {
    border-color: var(--error);
    background: var(--error-bg);
  }

  .worker-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .worker-icon {
    font-size: 16px;
  }

  .worker-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .worker-id {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
  }

  .worker-status-badge {
    margin-left: auto;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--surface-hover);
  }

  .worker-status-badge.working {
    background: var(--success-bg);
    color: var(--success);
  }

  .worker-status-badge.merging {
    background: var(--warning-bg);
    color: var(--warning);
  }

  .worker-status-badge.paused {
    background: var(--warning-bg);
    color: var(--warning);
  }

  .worker-status-badge.error {
    background: var(--error-bg);
    color: var(--error);
  }

  .worker-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .worker-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .task-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }

  .progress-bar {
    height: 6px;
    background: var(--surface-hover);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 4px;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
  }

  .status-message {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
    padding: 6px 8px;
    background: var(--surface-hover);
    border-radius: var(--radius-sm);
  }

  .elapsed-time {
    font-size: 11px;
    color: var(--text-muted);
  }

  .next-section {
    padding-top: 8px;
    border-top: 1px dashed var(--border);
  }

  .next-task {
    display: flex;
    gap: 8px;
    font-size: 12px;
    padding: 6px 8px;
    background: var(--surface-hover);
    border-radius: var(--radius-sm);
  }

  .next-task-id {
    font-weight: 600;
    color: var(--primary);
  }

  .next-task-title {
    color: var(--text);
  }

  .worker-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .action-btn {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: var(--surface-hover);
  }

  .action-btn.pause:hover,
  .action-btn.stop:hover {
    background: var(--warning-bg);
    border-color: var(--warning);
    color: var(--warning);
  }

  .action-btn.resume:hover {
    background: var(--success-bg);
    border-color: var(--success);
    color: var(--success);
  }

  .action-btn.view:hover {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
  }
</style>
