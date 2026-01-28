<script lang="ts">
  export let data;
  import { marked } from 'marked';

  $: cliHtml = data.docs?.cli ? marked(data.docs.cli) : '';
</script>

<div class="guide-page">
  <h1>CLI Reference</h1>
  <p class="lead">Complete reference for all chkd command-line commands.</p>

  <div class="markdown-content">
    {@html cliHtml}
  </div>
</div>

<style>
  .guide-page {
    color: var(--text, #fff);
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 8px;
  }

  .lead {
    font-size: 1.25rem;
    color: var(--text-muted, #888);
    margin-bottom: 40px;
  }

  .markdown-content :global(h1) {
    display: none;
  }

  .markdown-content :global(h2) {
    font-size: 1.5rem;
    margin-top: 40px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #333);
  }

  .markdown-content :global(h3) {
    font-size: 1.2rem;
    margin-top: 24px;
    margin-bottom: 12px;
  }

  .markdown-content :global(code) {
    background: var(--surface, #1a1a2e);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 13px;
  }

  .markdown-content :global(pre) {
    background: var(--surface-dark, #0d0d1a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 16px 0;
  }

  .markdown-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    padding: 10px 12px;
    border: 1px solid var(--border, #333);
    text-align: left;
  }

  .markdown-content :global(th) {
    background: var(--surface, #1a1a2e);
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border, #333);
    margin: 32px 0;
  }

  .markdown-content :global(blockquote) {
    border-left: 3px solid var(--accent, #8b5cf6);
    margin: 16px 0;
    padding-left: 16px;
    color: var(--text-muted, #888);
  }

  .markdown-content :global(a) {
    color: var(--accent, #8b5cf6);
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    padding-left: 24px;
    margin: 12px 0;
  }

  .markdown-content :global(li) {
    margin-bottom: 6px;
  }
</style>
