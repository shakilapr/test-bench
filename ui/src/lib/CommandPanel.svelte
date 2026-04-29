<script lang="ts">
  import type { DeviceDto } from "./stores.js";

  export let device: DeviceDto;

  let interval = 500;
  let busy = false;
  let lastResult = "";

  $: cmds = (device.metadata?.commands ?? []) as Array<{ type: string; label?: string; params?: any }>;
  $: hasInterval = cmds.some((c) => c.type === "set_sample_interval");

  async function setInterval() {
    busy = true;
    lastResult = "";
    try {
      const r = await fetch(`/api/devices/${device.device_id}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "set_sample_interval", params: { interval_ms: interval } }),
      });
      const j = await r.json();
      lastResult = r.ok ? `Issued ${j.cmd_id}` : `Error: ${j.error}`;
    } catch (e) {
      lastResult = `Error: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }
</script>

<section class="card">
  <h3 style="margin-top:0">Commands</h3>
  {#if hasInterval}
    <label>
      Sample interval (ms)
      <input type="number" min="100" max="10000" step="50" bind:value={interval} data-testid="interval-input" />
    </label>
    <button on:click={setInterval} disabled={busy} data-testid="set-interval-btn">
      {busy ? "Sending..." : "Apply"}
    </button>
  {:else}
    <p style="color:#888">No commands declared in metadata.</p>
  {/if}
  {#if lastResult}<p data-testid="cmd-result">{lastResult}</p>{/if}
</section>
