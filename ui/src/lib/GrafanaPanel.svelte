<script lang="ts">
  export let url: string | null;
  export let deviceId: string;
  $: src = url ? `${url}/d/bench-live?orgId=1&kiosk=tv&theme=dark&var-device_id=${encodeURIComponent(deviceId)}` : null;
</script>

<section class="card" style="height:400px;padding:0">
  {#if src}
    <iframe src={src} style="width:100%;height:100%;border:0;border-radius:6px" title="Grafana"></iframe>
  {:else}
    <p style="padding:1rem;color:#888">Grafana URL not configured.</p>
  {/if}
</section>
