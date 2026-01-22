<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';
  import type { SpecArea, SpecItem, ItemStatus, HandoverNote } from '$lib/api';

  export let areas: SpecArea[] = [];
  export let handoverNotes: HandoverNote[] = [];
  export let filterText: string = '';
  export let selectedItemId: string | null = null;
  export let expandedAreas: Set<string> = new Set();
  export let compact: boolean = false;

  const dispatch = createEventDispatcher<{
    selectItem: { item: SpecItem; area: SpecArea };
    skipItem: { item: SpecItem };
    toggleArea: { code: string };
  }>();

  // Inline markdown rendering
  function markedInline(text: string): string {
    if (!text) return '';
    return marked.parseInline(text) as string;
  }

  // Count items helper
  function countItems(items: SpecItem[]): { done: number; total: number; progress: number } {
    let done = 0;
    let total = 0;
    const count = (list: SpecItem[]) => {
      for (const item of list) {
        if (item.status === 'skipped') continue;
        total++;
        if (item.status === 'done') done++;
        if (item.children.length > 0) count(item.children);
      }
    };
    count(items);
    return { done, total, progress: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  // Filter items by search text
  function filterItems(items: SpecItem[]): SpecItem[] {
    if (!filterText.trim()) return items;
    const search = filterText.toLowerCase();
    return items.filter(item => {
      const matchesTitle = item.title.toLowerCase().includes(search);
      const matchesId = item.id.toLowerCase().includes(search);
      const matchesTags = item.tags?.some(t => t.toLowerCase().includes(search));
      return matchesTitle || matchesId || matchesTags;
    });
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

  // Get handover note for item
  function getHandoverNote(itemId: string): HandoverNote | undefined {
    return handoverNotes.find(n => n.taskId === itemId);
  }

  // Filtered areas
  $: filteredAreas = areas.filter(a => a.items.length > 0).map(area => ({
    ...area,
    items: filterItems(area.items)
  })).filter(area => area.items.length > 0 || !filterText);

  // Event handlers
  function handleToggleArea(code: string) {
    dispatch('toggleArea', { code });
  }

  function handleSelectItem(item: SpecItem, area: SpecArea) {
    dispatch('selectItem', { item, area });
  }

  function handleSkipItem(item: SpecItem) {
    dispatch('skipItem', { item });
  }
</script>

<div class="story-list" class:compact>
  {#each filteredAreas as area}
    {@const counts = countItems(area.items)}
    {@const filtered = filterItems(area.items)}
    {#if filtered.length > 0 || !filterText}
      <div class="area" class:expanded={expandedAreas.has(area.code)}>
        <button class="area-header" on:click={() => handleToggleArea(area.code)}>
          <span class="area-toggle">{expandedAreas.has(area.code) ? '▼' : '▶'}</span>
          <span class="area-name">{area.name}</span>
          <span class="area-count">{counts.done}/{counts.total}</span>
          <span class="area-progress">({counts.progress}%)</span>
          {#if area.status === 'complete'}
            <span class="area-status complete">✓</span>
          {:else if area.status === 'in-progress'}
            <span class="area-status progress">◐</span>
          {/if}
        </button>

        {#if expandedAreas.has(area.code)}
          <div class="area-content">
            {#if area.story && !compact}
              <blockquote class="area-story">{area.story}</blockquote>
            {/if}

            <ul class="items">
              {#each filtered as item}
                {@const itemHandover = getHandoverNote(item.id)}
                {@const isSelected = selectedItemId === item.id}
                <li
                  class="item {getStatusClass(item.status)}"
                  class:has-handover={!!itemHandover}
                  class:selected={isSelected}
                >
                  <button class="item-row" on:click={() => handleSelectItem(item, area)}>
                    <span class="item-status">{getStatusIcon(item.status)}</span>
                    <span class="item-id">{item.id}</span>
                    <span class="item-title">{@html markedInline(item.title)}</span>
                    {#if item.tags && item.tags.length > 0}
                      <span class="item-tags">
                        {#each item.tags as tag}
                          <span class="item-tag">{tag}</span>
                        {/each}
                      </span>
                    {/if}
                    {#if itemHandover}
                      <span class="item-handover" title="Has handover note">📝</span>
                    {/if}
                    {#if item.children.length > 0}
                      {@const childCounts = countItems(item.children)}
                      <span class="item-progress">{childCounts.done}/{childCounts.total}</span>
                    {/if}
                  </button>
                  {#if item.status !== 'done' && !compact}
                    <button
                      class="item-skip"
                      on:click|stopPropagation={() => handleSkipItem(item)}
                      title={item.status === 'skipped' ? 'Unskip' : 'Skip'}
                    >
                      {item.status === 'skipped' ? '↩' : '–'}
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  {/each}

  {#if filteredAreas.length === 0}
    <div class="no-items">
      {#if filterText}
        No items match "{filterText}"
      {:else}
        No items to display
      {/if}
    </div>
  {/if}
</div>

<style>
  .story-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .area {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .area.expanded {
    border-color: var(--primary);
  }

  .area-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-md);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font-size: var(--text-base);
  }

  .area-header:hover {
    background: var(--bg-tertiary);
  }

  .area-toggle {
    font-size: 10px;
    color: var(--text-muted);
    width: 12px;
  }

  .area-name {
    font-weight: 600;
    flex: 1;
  }

  .area-count {
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .area-progress {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .area-status {
    font-size: 12px;
  }

  .area-status.complete {
    color: var(--success);
  }

  .area-status.progress {
    color: var(--info);
  }

  .area-content {
    padding: 0 var(--space-md) var(--space-md);
  }

  .area-story {
    margin: 0 0 var(--space-md) 0;
    padding: var(--space-sm) var(--space-md);
    border-left: 3px solid var(--primary);
    background: var(--bg-tertiary);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-style: italic;
  }

  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    border-radius: var(--radius-sm);
    background: var(--bg);
    border-left: 3px solid var(--border);
  }

  .item.selected {
    background: var(--info-bg);
    border-left-color: var(--info);
  }

  .item.status-done {
    border-left-color: var(--success);
    opacity: 0.7;
  }

  .item.status-in-progress {
    border-left-color: var(--info);
  }

  .item.status-skipped {
    border-left-color: var(--text-muted);
    opacity: 0.5;
  }

  .item.status-blocked {
    border-left-color: var(--warning);
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font-size: var(--text-sm);
    min-width: 0;
  }

  .item-row:hover {
    background: var(--bg-tertiary);
  }

  .item-status {
    font-size: 12px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .status-done .item-status {
    color: var(--success);
  }

  .status-in-progress .item-status {
    color: var(--info);
  }

  .status-blocked .item-status {
    color: var(--warning);
  }

  .item-id {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .item-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-tags {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .item-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .item-handover {
    font-size: 12px;
    flex-shrink: 0;
  }

  .item-progress {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .item-skip {
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .item:hover .item-skip {
    opacity: 1;
  }

  .item-skip:hover {
    color: var(--text);
  }

  .no-items {
    padding: var(--space-xl);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* Compact mode */
  .compact .area-header {
    padding: var(--space-sm) var(--space-md);
  }

  .compact .area-content {
    padding: 0 var(--space-sm) var(--space-sm);
  }

  .compact .item-row {
    padding: var(--space-xs) var(--space-sm);
  }

  .compact .item-id {
    display: none;
  }
</style>
