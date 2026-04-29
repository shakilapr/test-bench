<script lang="ts">
  import type { DeviceDto } from "./stores.js";

  export let device: DeviceDto;

  let active: { recording_id: string; started_at: number } | null = null;
  let label = "";
  let busy = false;
  let history: any[] = [];

  async function refresh() {
    const r = await fetch(`/api/devices/${device.device_id}/recordings`);
    if (r.ok) {
      const list = await r.json();
      history = list;
      active = list.find((x: any) => !x.ended_at) ?? null;
    }
  }

  $: if (device) refresh();

  async function start() {
    busy = true;
    try {
      const r = await fetch(`/api/devices/${device.device_id}/recordings/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (r.ok) await refresh();
    } finally { busy = false; }
  }

  async function stop() {
    busy = true;
    try {
      const r = await fetch(`/api/devices/${device.device_id}/recordings/stop`, { method: "POST" });
      if (r.ok) await refresh();
    } finally { busy = false; }
  }
</script>

<section class="card">
  <h3 style="margin-top:0">Recording</h3>
  {#if active}
    <p>Active: <strong>{active.recording_id}</strong> since {new Date(active.started_at).toLocaleTimeString()}</p>
    <button on:click={stop} disabled={busy} data-testid="stop-rec-btn">Stop</button>
  {:else}
    <label>Label <input bind:value={label} placeholder="optional" data-testid="rec-label" /></label>
    <button on:click={start} disabled={busy} data-testid="start-rec-btn">Start recording</button>
  {/if}
  {#if history.length > 0}
    <details style="margin-top:0.5rem">
      <summary>History ({history.length})</summary>
      <ul>{#each history as h}<li><code>{h.recording_id}</code> {h.label ?? ""}</li>{/each}</ul>
    </details>
  {/if}
</section>
