<script lang="ts">
  import type { DeviceDto } from "./stores.js";
  import { selectedDeviceId, liveReadings } from "./stores.js";
  export let items: DeviceDto[] = [];

  function ago(ts: number): string {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }
</script>

<nav class="device-list" data-testid="device-list">
  {#if items.length === 0}
    <p class="muted">No devices yet. Bring one online.</p>
  {/if}
  {#each items as d (d.device_id)}
    {@const r = $liveReadings[d.device_id]}
    {@const fresh = r && Date.now() - r.ts < 5000}
    <button
      class="row"
      class:active={$selectedDeviceId === d.device_id}
      on:click={() => selectedDeviceId.set(d.device_id)}
      data-testid="device-row-{d.device_id}"
    >
      <span class="dot status-{d.last_status}" class:pulse={fresh}></span>
      <span class="id">{d.device_id}</span>
      <span class="meta">{ago(d.last_seen)}</span>
    </button>
  {/each}
</nav>

<style>
  .device-list { display: flex; flex-direction: column; padding: 0.25rem; gap: 1px; }
  .row {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    color: var(--fg);
    cursor: pointer;
  }
  .row:hover { background: #222831; }
  .row.active { background: #243042; border-color: var(--accent); }
  .dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #444;
    box-shadow: 0 0 0 0 transparent;
  }
  .dot.status-online { background: var(--ok); }
  .dot.status-offline { background: var(--err); }
  .dot.pulse { box-shadow: 0 0 0 3px rgba(78,201,107,0.2); }
  .id { font-family: ui-monospace, monospace; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; }
  .meta { color: #888; font-size: 0.75rem; }
  .muted { color: #888; padding: 0.5rem; }
</style>
