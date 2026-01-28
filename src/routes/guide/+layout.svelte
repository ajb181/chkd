<script lang="ts">
  import { page } from '$app/stores';
  import GuideSearch from '$lib/components/GuideSearch.svelte';

  export let data;

  let searchOpen = false;

  const navSections = [
    {
      title: 'Getting Started',
      items: [
        { href: '/guide', label: 'Overview', icon: '📖' },
        { href: '/guide/quickstart', label: 'Quick Start', icon: '🚀' },
        { href: '/guide/concepts', label: 'Core Concepts', icon: '💡' }
      ]
    },
    {
      title: 'Daily Use',
      items: [
        { href: '/guide/workflow', label: 'Workflow', icon: '🔄' },
        { href: '/guide/cli', label: 'CLI Reference', icon: '💻' },
        { href: '/guide/mcp', label: 'MCP Tools', icon: '🔧' }
      ]
    },
    {
      title: 'Advanced',
      items: [
        { href: '/guide/multiworker', label: 'Multi-Worker', icon: '👥' },
        { href: '/guide/skills', label: 'Custom Skills', icon: '⚡' }
      ]
    },
    {
      title: 'Team',
      items: [
        { href: '/guide/saas', label: 'SaaS Setup', icon: '☁️' }
      ]
    },
    {
      title: 'Help',
      items: [
        { href: '/guide/troubleshooting', label: 'Troubleshooting', icon: '🔍' },
        { href: '/guide/faq', label: 'FAQ', icon: '❓' }
      ]
    }
  ];

  function isActive(href: string): boolean {
    return $page.url.pathname === href;
  }

  function handleSearchSelect(e: CustomEvent) {
    const result = e.detail;
    console.log('Selected:', result);
  }
</script>

<svelte:head>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="guide-layout">
  <aside class="guide-sidebar">
    <div class="sidebar-header">
      <a href="/" class="back-link">← Dashboard</a>
      <button class="search-trigger" on:click={() => searchOpen = true}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
    </div>

    <nav class="sidebar-nav">
      {#each navSections as section}
        <div class="nav-section">
          <div class="nav-section-title">{section.title}</div>
          {#each section.items as item}
            <a
              href={item.href}
              class="nav-item"
              class:active={isActive(item.href)}
            >
              <span class="nav-icon">{item.icon}</span>
              <span class="nav-label">{item.label}</span>
            </a>
          {/each}
        </div>
      {/each}
    </nav>
  </aside>

  <main class="guide-content">
    <slot />
  </main>
</div>

<GuideSearch
  docs={data.docs || {}}
  bind:isOpen={searchOpen}
  on:select={handleSearchSelect}
  on:close={() => searchOpen = false}
/>

<style>
  .guide-layout {
    display: flex;
    min-height: 100vh;
    background: var(--bg);
    font-family: var(--font-sans);
  }

  .guide-sidebar {
    width: 280px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    padding: 20px 0;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 0 20px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }

  .back-link {
    display: block;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 12px;
    margin-bottom: 16px;
    letter-spacing: 0.5px;
  }

  .back-link:hover {
    color: var(--coral);
  }

  .search-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-dim);
    font-size: 13px;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.15s;
  }

  .search-trigger:hover {
    border-color: var(--coral);
    color: var(--text);
  }

  .search-trigger svg {
    width: 16px;
    height: 16px;
  }

  .search-trigger span {
    flex: 1;
    text-align: left;
  }

  .search-trigger kbd {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    padding: 2px 6px;
    font-size: 10px;
    font-family: var(--font-mono);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }

  .sidebar-nav {
    padding: 0 12px;
  }

  .nav-section {
    margin-bottom: 24px;
  }

  .nav-section-title {
    font-family: var(--font-display);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    padding: 0 8px;
    margin-bottom: 12px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 13px;
    transition: all 0.15s;
  }

  .nav-item:hover {
    background: var(--bg-tertiary);
    color: var(--text);
    border-left-color: var(--border);
  }

  .nav-item.active {
    background: var(--coral-dim);
    color: var(--coral);
    border-left-color: var(--coral);
  }

  .nav-icon {
    font-size: 14px;
    opacity: 0.7;
  }

  .nav-item.active .nav-icon {
    opacity: 1;
  }

  .guide-content {
    flex: 1;
    padding: 40px 60px;
    max-width: 900px;
    color: var(--text);
    line-height: 1.8;
  }

  .guide-content :global(h1) {
    font-family: var(--font-display);
    font-size: 1.5rem;
    color: var(--text);
    margin-bottom: 1.5rem;
    letter-spacing: -0.5px;
    line-height: 1.4;
  }

  .guide-content :global(h2) {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--coral);
    margin: 2.5rem 0 1rem;
    letter-spacing: 0;
    line-height: 1.4;
  }

  .guide-content :global(h3) {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
    margin: 2rem 0 0.75rem;
  }

  .guide-content :global(p) {
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .guide-content :global(code) {
    font-family: var(--font-mono);
    background: var(--bg-secondary);
    padding: 0.2rem 0.4rem;
    font-size: 0.9em;
    color: var(--coral);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .guide-content :global(pre) {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    overflow-x: auto;
    margin: 1.5rem 0;
  }

  .guide-content :global(pre code) {
    background: none;
    border: none;
    padding: 0;
    color: var(--text-muted);
  }

  .guide-content :global(ul),
  .guide-content :global(ol) {
    color: var(--text-muted);
    margin: 1rem 0 1.5rem 1.5rem;
  }

  .guide-content :global(li) {
    margin-bottom: 0.5rem;
  }

  .guide-content :global(a) {
    color: var(--teal);
    text-decoration: none;
    border-bottom: 1px dashed var(--teal);
  }

  .guide-content :global(a:hover) {
    color: var(--coral);
    border-color: var(--coral);
  }

  .guide-content :global(blockquote) {
    border-left: 3px solid var(--coral);
    background: var(--coral-dim);
    padding: 1rem 1.5rem;
    margin: 1.5rem 0;
    color: var(--text-muted);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .guide-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
  }

  .guide-content :global(th),
  .guide-content :global(td) {
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
    text-align: left;
  }

  .guide-content :global(th) {
    background: var(--bg-secondary);
    font-family: var(--font-display);
    font-size: 0.75rem;
    color: var(--coral);
    letter-spacing: 0.5px;
  }

  .guide-content :global(td) {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .guide-layout {
      flex-direction: column;
    }

    .guide-sidebar {
      width: 100%;
      height: auto;
      position: relative;
    }

    .guide-content {
      padding: 20px;
    }
  }
</style>
