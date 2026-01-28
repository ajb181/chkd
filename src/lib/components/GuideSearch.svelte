<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import FlexSearch from 'flexsearch';

  export let docs: Record<string, string> = {};
  export let isOpen = false;

  const dispatch = createEventDispatcher();

  interface SearchResult {
    id: string;
    title: string;
    section: string;
    snippet: string;
    score: number;
  }

  let query = '';
  let results: SearchResult[] = [];
  let selectedIndex = 0;
  let inputEl: HTMLInputElement;
  let index: FlexSearch.Document<{ id: string; title: string; content: string; section: string }>;

  // Build search index from docs
  onMount(() => {
    index = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['title', 'content'],
        store: ['title', 'section', 'content']
      },
      tokenize: 'forward',
      context: true
    });

    // Index each document section
    Object.entries(docs).forEach(([docId, content]) => {
      const sections = parseMarkdownSections(content, docId);
      sections.forEach(section => {
        index.add(section);
      });
    });
  });

  // Parse markdown into searchable sections
  function parseMarkdownSections(markdown: string, docId: string): Array<{ id: string; title: string; content: string; section: string }> {
    const sections: Array<{ id: string; title: string; content: string; section: string }> = [];
    const lines = markdown.split('\n');

    let currentTitle = docId;
    let currentContent: string[] = [];
    let sectionIndex = 0;

    for (const line of lines) {
      const h1Match = line.match(/^# (.+)$/);
      const h2Match = line.match(/^## (.+)$/);
      const h3Match = line.match(/^### (.+)$/);

      if (h1Match || h2Match || h3Match) {
        // Save previous section
        if (currentContent.length > 0) {
          sections.push({
            id: `${docId}-${sectionIndex}`,
            title: currentTitle,
            content: currentContent.join(' ').replace(/[#*`\[\]]/g, '').trim(),
            section: docId
          });
          sectionIndex++;
        }
        currentTitle = (h1Match || h2Match || h3Match)![1];
        currentContent = [];
      } else if (line.trim()) {
        currentContent.push(line);
      }
    }

    // Don't forget last section
    if (currentContent.length > 0) {
      sections.push({
        id: `${docId}-${sectionIndex}`,
        title: currentTitle,
        content: currentContent.join(' ').replace(/[#*`\[\]]/g, '').trim(),
        section: docId
      });
    }

    return sections;
  }

  // Search function
  function search(q: string) {
    if (!q.trim() || !index) {
      results = [];
      return;
    }

    const searchResults = index.search(q, { limit: 10, enrich: true });
    const seen = new Set<string>();
    results = [];

    for (const field of searchResults) {
      for (const item of field.result) {
        const doc = item.doc as any;
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);

        // Create snippet with highlighted query
        let snippet = doc.content.substring(0, 150);
        const lowerContent = doc.content.toLowerCase();
        const lowerQuery = q.toLowerCase();
        const pos = lowerContent.indexOf(lowerQuery);
        if (pos > 0) {
          const start = Math.max(0, pos - 50);
          const end = Math.min(doc.content.length, pos + q.length + 100);
          snippet = (start > 0 ? '...' : '') + doc.content.substring(start, end) + (end < doc.content.length ? '...' : '');
        }

        results.push({
          id: doc.id,
          title: doc.title,
          section: doc.section,
          snippet,
          score: 1
        });
      }
    }

    selectedIndex = 0;
  }

  $: search(query);

  // Keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function selectResult(result: SearchResult) {
    dispatch('select', result);
    close();
  }

  function close() {
    isOpen = false;
    query = '';
    results = [];
    dispatch('close');
  }

  // Focus input when opened
  $: if (isOpen && inputEl) {
    setTimeout(() => inputEl?.focus(), 10);
  }

  // Global keyboard shortcut
  onMount(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen = !isOpen;
      }
    }
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  });
</script>

{#if isOpen}
  <div class="search-overlay" on:click={close} on:keydown={handleKeydown}>
    <div class="search-modal" on:click|stopPropagation>
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          class="search-input"
          placeholder="Search the guide..."
          on:keydown={handleKeydown}
        />
        <kbd class="search-shortcut">ESC</kbd>
      </div>

      {#if results.length > 0}
        <div class="search-results">
          {#each results as result, i}
            <button
              class="search-result"
              class:selected={i === selectedIndex}
              on:click={() => selectResult(result)}
            >
              <div class="result-title">{result.title}</div>
              <div class="result-section">{result.section}</div>
              <div class="result-snippet">{result.snippet}</div>
            </button>
          {/each}
        </div>
      {:else if query.trim()}
        <div class="search-empty">
          No results for "{query}"
        </div>
      {:else}
        <div class="search-hints">
          <div class="hint">Try searching for:</div>
          <div class="hint-tags">
            <button class="hint-tag" on:click={() => query = 'install'}>install</button>
            <button class="hint-tag" on:click={() => query = 'add feature'}>add feature</button>
            <button class="hint-tag" on:click={() => query = 'bug'}>bug</button>
            <button class="hint-tag" on:click={() => query = 'MCP'}>MCP</button>
            <button class="hint-tag" on:click={() => query = 'worker'}>worker</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .search-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .search-modal {
    width: 100%;
    max-width: 600px;
    background: var(--surface, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border, #333);
  }

  .search-icon {
    width: 20px;
    height: 20px;
    color: var(--text-muted, #888);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: none;
    border: none;
    font-size: 16px;
    color: var(--text, #fff);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted, #666);
  }

  .search-shortcut {
    background: var(--surface-dark, #111);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: var(--text-muted, #888);
  }

  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .search-result {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 20px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border, #222);
    cursor: pointer;
    color: var(--text, #fff);
  }

  .search-result:hover,
  .search-result.selected {
    background: var(--surface-hover, #252540);
  }

  .result-title {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .result-section {
    font-size: 12px;
    color: var(--accent, #8b5cf6);
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .result-snippet {
    font-size: 13px;
    color: var(--text-muted, #888);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .search-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-muted, #888);
  }

  .search-hints {
    padding: 20px;
  }

  .hint {
    font-size: 13px;
    color: var(--text-muted, #888);
    margin-bottom: 12px;
  }

  .hint-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hint-tag {
    background: var(--surface-dark, #111);
    border: 1px solid var(--border, #333);
    border-radius: 16px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--text, #fff);
    cursor: pointer;
  }

  .hint-tag:hover {
    background: var(--surface-hover, #252540);
    border-color: var(--accent, #8b5cf6);
  }
</style>
