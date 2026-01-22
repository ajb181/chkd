<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';
  import type { SpecItem, SpecArea, ItemStatus, HandoverNote, Priority } from '$lib/api';

  export let item: SpecItem;
  export let area: SpecArea;
  export let handoverNote: HandoverNote | null = null;
  export let isAnchor: boolean = false;
  export let editMode: boolean = false;

  const dispatch = createEventDispatcher<{
    close: void;
    edit: { title: string; description: string; story: string };
    tickItem: { itemId: string };
    skipItem: { item: SpecItem };
    deleteItem: { item: SpecItem };
    addChild: { parentId: string; title: string };
    editChild: { childId: string; title: string };
    deleteChild: { childId: string };
    setAnchor: { item: SpecItem };
    clearAnchor: void;
    setPriority: { priority: Priority };
  }>();

  // Edit state
  let editing = editMode;
  let editTitle = item.title;
  let editDescription = item.description || '';
  let editStory = item.story || '';

  // Child editing state
  let editingChildId: string | null = null;
  let editingChildTitle = '';
  let newSubtaskInput = '';

  // Confirm delete state
  let confirmingDelete = false;

  // Inline markdown rendering
  function markedInline(text: string): string {
    if (!text) return '';
    return marked.parseInline(text) as string;
  }

  // Status helpers
  function getStatusIcon(status: ItemStatus): string {
    switch (status) {
      case 'done': return '✓';
      case 'in-progress': return '◐';
      case 'skipped': return '–';
      case 'blocked': return '!';
      default: return '○';
    }
  }

  function getStatusClass(status: ItemStatus): string {
    return `status-${status}`;
  }

  // Edit functions
  function startEdit() {
    editing = true;
    editTitle = item.title;
    editDescription = item.description || '';
    editStory = item.story || '';
  }

  function saveEdit() {
    dispatch('edit', {
      title: editTitle,
      description: editDescription,
      story: editStory
    });
    editing = false;
  }

  function cancelEdit() {
    editing = false;
  }

  // Child editing
  function startEditChild(childId: string, title: string) {
    editingChildId = childId;
    editingChildTitle = title;
  }

  function saveEditChild() {
    if (editingChildId && editingChildTitle.trim()) {
      dispatch('editChild', { childId: editingChildId, title: editingChildTitle.trim() });
    }
    editingChildId = null;
    editingChildTitle = '';
  }

  function cancelEditChild() {
    editingChildId = null;
    editingChildTitle = '';
  }

  // Add subtask
  function handleAddSubtask() {
    if (newSubtaskInput.trim()) {
      dispatch('addChild', { parentId: item.id, title: newSubtaskInput.trim() });
      newSubtaskInput = '';
    }
  }

  // Watch for item changes
  $: if (item) {
    editTitle = item.title;
    editDescription = item.description || '';
    editStory = item.story || '';
    confirmingDelete = false;
    editingChildId = null;
  }
</script>

<div class="story-detail">
  <div class="detail-header">
    {#if editing}
      <input
        type="text"
        bind:value={editTitle}
        class="edit-title"
        placeholder="Feature title"
      />
    {:else}
      <h2>{@html markedInline(item.title)}</h2>
    {/if}
    <button class="close-btn" on:click={() => dispatch('close')}>×</button>
  </div>

  {#if editing}
    <textarea
      bind:value={editDescription}
      class="edit-desc"
      placeholder="Description (optional)"
      rows="2"
    ></textarea>
    <textarea
      bind:value={editStory}
      class="edit-story"
      placeholder="User story (e.g., As a user, I want...)"
      rows="2"
    ></textarea>
    <div class="edit-actions">
      <button class="btn btn-primary" on:click={saveEdit}>Save</button>
      <button class="btn btn-ghost" on:click={cancelEdit}>Cancel</button>
    </div>
  {:else}
    <!-- Handover note -->
    {#if handoverNote}
      <div class="detail-handover">
        <div class="handover-header">
          <span class="handover-icon">📝</span>
          <span class="handover-label">Handover Note</span>
          <span class="handover-meta">by {handoverNote.pausedBy} · {new Date(handoverNote.createdAt).toLocaleDateString()}</span>
        </div>
        <blockquote class="handover-content">{@html markedInline(handoverNote.note)}</blockquote>
      </div>
    {/if}

    <!-- Description -->
    {#if item.description}
      <div class="detail-desc editable" on:click={startEdit} title="Click to edit">
        {@html markedInline(item.description)}
      </div>
    {:else}
      <div class="detail-desc empty editable" on:click={startEdit} title="Click to add description">
        Add description...
      </div>
    {/if}

    <!-- User story -->
    {#if item.story || area.story}
      <div class="detail-story editable" on:click={startEdit} title="Click to edit">
        <h3>User Story</h3>
        <blockquote>{@html markedInline(item.story || area.story || '')}</blockquote>
      </div>
    {:else}
      <div class="detail-story empty editable" on:click={startEdit} title="Click to add story">
        <h3>User Story</h3>
        <blockquote>Add user story...</blockquote>
      </div>
    {/if}

    <!-- Checklist -->
    <h3>Checklist</h3>
    {#if item.children.length > 0}
      <ul class="detail-checklist">
        {#each item.children as child}
          <li class="{getStatusClass(child.status)}">
            {#if editingChildId === child.id}
              <form class="edit-child-form" on:submit|preventDefault={saveEditChild}>
                <input
                  type="text"
                  bind:value={editingChildTitle}
                  on:keydown={(e) => e.key === 'Escape' && cancelEditChild()}
                  autofocus
                />
                <button type="submit" title="Save">✓</button>
                <button type="button" on:click={cancelEditChild} title="Cancel">×</button>
              </form>
            {:else}
              <button
                class="detail-checklist-tick"
                on:click={() => dispatch('tickItem', { itemId: child.id })}
                title={child.status === 'done' ? 'Already complete' : 'Click to mark complete'}
              >
                <span class="item-status">{getStatusIcon(child.status)}</span>
              </button>
              <span
                class="detail-checklist-title"
                on:dblclick={() => startEditChild(child.id, child.title)}
                title="Double-click to edit"
              >{@html markedInline(child.title)}</span>
              <button
                class="detail-checklist-edit"
                on:click|stopPropagation={() => startEditChild(child.id, child.title)}
                title="Edit subtask"
              >✎</button>
              <button
                class="detail-checklist-remove"
                on:click|stopPropagation={() => dispatch('deleteChild', { childId: child.id })}
                title="Remove subtask"
              >×</button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="no-subtasks">No subtasks yet</p>
    {/if}

    <form class="add-subtask-form" on:submit|preventDefault={handleAddSubtask}>
      <input
        type="text"
        bind:value={newSubtaskInput}
        placeholder="Add subtask..."
      />
      <button type="submit" disabled={!newSubtaskInput.trim()}>+</button>
    </form>

    <!-- Meta info -->
    <div class="detail-meta">
      <span class="meta-area">{area.name}</span>
      <span class="meta-id">{item.id}</span>
      <span class="meta-status {getStatusClass(item.status)}">
        {item.status}
      </span>
    </div>

    <!-- Anchor control -->
    {#if isAnchor}
      <div class="anchor-active">
        <span class="anchor-badge">🎯 Active Task</span>
        <button class="btn btn-ghost btn-sm" on:click={() => dispatch('clearAnchor')}>
          Clear
        </button>
      </div>
    {:else}
      <button
        class="btn btn-primary anchor-btn"
        on:click={() => dispatch('setAnchor', { item })}
        disabled={item.status === 'done'}
        title={item.status === 'done' ? 'Item already complete' : 'Set as active task for Claude'}
      >
        🎯 Set as Active Task
      </button>
    {/if}

    <!-- Action buttons -->
    <div class="detail-actions">
      <button class="btn btn-secondary" on:click={startEdit}>Edit</button>
      <button class="btn btn-secondary" on:click={() => dispatch('skipItem', { item })}>
        {item.status === 'skipped' ? 'Unskip' : 'Skip'}
      </button>
      {#if !confirmingDelete}
        <button class="btn btn-danger-ghost" on:click={() => confirmingDelete = true}>Delete</button>
      {:else}
        <button class="btn btn-danger" on:click={() => dispatch('deleteItem', { item })}>Confirm Delete</button>
        <button class="btn btn-ghost" on:click={() => confirmingDelete = false}>Cancel</button>
      {/if}
    </div>

    <!-- Priority -->
    <div class="priority-section">
      <h3>Priority</h3>
      <div class="priority-options">
        <button
          class="priority-btn p1"
          class:selected={item.priority === 1}
          on:click={() => dispatch('setPriority', { priority: 1 })}
        >
          P1 High
        </button>
        <button
          class="priority-btn p2"
          class:selected={item.priority === 2}
          on:click={() => dispatch('setPriority', { priority: 2 })}
        >
          P2 Med
        </button>
        <button
          class="priority-btn p3"
          class:selected={item.priority === 3}
          on:click={() => dispatch('setPriority', { priority: 3 })}
        >
          P3 Low
        </button>
        <button
          class="priority-btn backlog"
          class:selected={item.priority === null}
          on:click={() => dispatch('setPriority', { priority: null })}
        >
          Backlog
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .story-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    height: 100%;
    overflow-y: auto;
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .detail-header h2 {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
    margin: 0;
    flex: 1;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .edit-title {
    flex: 1;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .edit-desc, .edit-story {
    width: 100%;
    resize: vertical;
    min-height: 60px;
  }

  .edit-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .detail-handover {
    background: var(--info-bg);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    border-left: 3px solid var(--info);
  }

  .handover-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .handover-icon {
    font-size: 14px;
  }

  .handover-label {
    font-weight: 600;
    font-size: var(--text-sm);
    color: var(--text);
  }

  .handover-meta {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  .handover-content {
    margin: 0;
    padding: 0;
    border: none;
    font-style: italic;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .detail-desc, .detail-story {
    cursor: pointer;
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .detail-desc:hover, .detail-story:hover {
    background: var(--bg-tertiary);
  }

  .detail-desc.empty, .detail-story.empty blockquote {
    color: var(--text-muted);
    font-style: italic;
  }

  .detail-story h3 {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
    margin: 0 0 var(--space-xs) 0;
  }

  .detail-story blockquote {
    margin: 0;
    padding-left: var(--space-md);
    border-left: 2px solid var(--primary);
    color: var(--text-muted);
    font-style: italic;
  }

  h3 {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text);
    margin: var(--space-md) 0 var(--space-sm) 0;
  }

  .detail-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-checklist li {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
  }

  .detail-checklist li.status-done {
    opacity: 0.6;
  }

  .detail-checklist-tick {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px;
    font-size: 14px;
  }

  .status-done .item-status {
    color: var(--success);
  }

  .status-in-progress .item-status {
    color: var(--info);
  }

  .detail-checklist-title {
    flex: 1;
    font-size: var(--text-sm);
    cursor: text;
  }

  .detail-checklist-edit, .detail-checklist-remove {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 12px;
    padding: 2px 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .detail-checklist li:hover .detail-checklist-edit,
  .detail-checklist li:hover .detail-checklist-remove {
    opacity: 1;
  }

  .detail-checklist-edit:hover {
    color: var(--primary);
  }

  .detail-checklist-remove:hover {
    color: var(--error);
  }

  .edit-child-form {
    display: flex;
    gap: var(--space-xs);
    flex: 1;
  }

  .edit-child-form input {
    flex: 1;
    font-size: var(--text-sm);
    padding: 2px var(--space-xs);
  }

  .edit-child-form button {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
  }

  .no-subtasks {
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-style: italic;
    margin: 0;
  }

  .add-subtask-form {
    display: flex;
    gap: var(--space-xs);
  }

  .add-subtask-form input {
    flex: 1;
    font-size: var(--text-sm);
  }

  .add-subtask-form button {
    padding: var(--space-xs) var(--space-sm);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .add-subtask-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .detail-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    border-top: 1px solid var(--border);
    margin-top: var(--space-md);
  }

  .meta-area {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--primary);
    background: var(--info-bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .meta-id {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  .meta-status {
    font-size: var(--text-xs);
    text-transform: capitalize;
  }

  .meta-status.status-done {
    color: var(--success);
  }

  .meta-status.status-in-progress {
    color: var(--info);
  }

  .anchor-active {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background: var(--success-bg);
    border-radius: var(--radius-md);
  }

  .anchor-badge {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--success);
  }

  .anchor-btn {
    width: 100%;
  }

  .detail-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .btn-danger-ghost {
    background: transparent;
    color: var(--error);
    border: 1px solid var(--error);
  }

  .btn-danger-ghost:hover {
    background: var(--error-bg);
  }

  .priority-section {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
  }

  .priority-options {
    display: flex;
    gap: var(--space-xs);
  }

  .priority-btn {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 500;
    transition: all 0.15s;
  }

  .priority-btn.p1 {
    border-color: var(--error);
    color: var(--error);
  }

  .priority-btn.p1.selected {
    background: var(--error);
    color: white;
  }

  .priority-btn.p2 {
    border-color: var(--warning);
    color: var(--warning);
  }

  .priority-btn.p2.selected {
    background: var(--warning);
    color: white;
  }

  .priority-btn.p3 {
    border-color: var(--info);
    color: var(--info);
  }

  .priority-btn.p3.selected {
    background: var(--info);
    color: white;
  }

  .priority-btn.backlog {
    color: var(--text-muted);
  }

  .priority-btn.backlog.selected {
    background: var(--bg-tertiary);
    color: var(--text);
  }
</style>
