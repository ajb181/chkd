<script lang="ts">
  import '../app.css';
</script>

<div class="app">
  <slot />
</div>

<style>
  .app {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
  }
</style>
