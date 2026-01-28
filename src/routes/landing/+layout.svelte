<script>
  // Standalone layout - no parent app chrome
</script>

<div class="landing-wrapper">
  <slot />
</div>

<style>
  :global(body) {
    margin: 0 !important;
    padding: 0 !important;
    background: #0a0a0f !important;
  }

  :global(.app) {
    background: #0a0a0f !important;
    min-height: 100vh;
  }

  .landing-wrapper {
    background: #0a0a0f;
    min-height: 100vh;
    isolation: isolate;
  }
</style>
