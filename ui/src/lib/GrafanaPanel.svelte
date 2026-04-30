<script lang="ts">
  export let url: string | null;
  export let deviceId: string;
  $: src = url ? `${url}/d/bench-live?orgId=1&kiosk=tv&theme=dark&var-device_id=${encodeURIComponent(deviceId)}` : null;
</script>

{#if src}
  <details class="card grafana">
    <summary>Grafana dashboard</summary>
    <iframe {src} title="Grafana"></iframe>
  </details>
{/if}

<style>
  .grafana { padding: 0.75rem; }
  .grafana summary { cursor: pointer; color: var(--accent); font-weight: 500; }
  .grafana iframe { width: 100%; height: 420px; border: 0; border-radius: 6px; margin-top: 0.5rem; }
</style>
