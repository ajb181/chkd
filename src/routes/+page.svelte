<script lang="ts">
  let status = $state<string>('checking...');

  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      status = data.status === 'ok' ? '✅ Server running' : '❌ Error';
    } catch {
      status = '❌ API not ready';
    }
  }

  $effect(() => {
    checkHealth();
  });
</script>

<main>
  <h1>chkd <span class="version">v0.2.0</span></h1>
  <p class="status">{status}</p>
  <p class="tagline">Development quality control</p>
</main>

<style>
  main {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 600px;
    margin: 100px auto;
    text-align: center;
  }

  h1 {
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }

  .version {
    font-size: 1rem;
    color: #888;
    font-weight: normal;
  }

  .status {
    font-size: 1.2rem;
    margin: 1rem 0;
  }

  .tagline {
    color: #666;
  }
</style>
