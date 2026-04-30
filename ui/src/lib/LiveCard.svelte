<script lang="ts">
  import type { DeviceDto, Reading } from "./stores.js";
  import { recentReadings } from "./stores.js";
  import Sparkline from "./Sparkline.svelte";
  export let device: DeviceDto;
  export let reading: Reading | undefined;

  $: meta = device.metadata;
  $: channels = ((meta?.channels ?? []) as Array<{ key: string; label: string; unit: string; precision?: number; chartable?: boolean }>);
  $: rings = $recentReadings[device.device_id] ?? {};

  function format(v: number, precision = 2): string {
    return v.toFixed(precision);
  }
  function qualityLabel(channelKey: string, code: number | undefined): string {
    if (code === undefined) return "";
    const codes = meta?.quality_codes?.[channelKey];
    return codes?.[String(code)] ?? "";
  }
</script>

<section class="card live" data-testid="live-card-{device.device_id}">
  <header class="head">
    <div>
      <h3>{device.device_id}</h3>
      <span class="status-{device.last_status}">● {device.last_status}</span>
    </div>
    <small class="muted">v{device.metadata_version} · {channels.length} channels</small>
  </header>
  {#if !reading}
    <p class="muted">Waiting for telemetry…</p>
  {:else}
    <div class="grid">
      {#each channels as ch}
        {@const v = reading.readings[ch.key]}
        {@const q = qualityLabel(ch.key, reading.quality?.[ch.key])}
        <div class="cell" data-testid="ch-{ch.key}">
          <div class="ch-label">{ch.label}</div>
          <div class="ch-value">
            <span class="num">{v === undefined ? "—" : format(v, ch.precision ?? 2)}</span>
            <span class="unit">{ch.unit}</span>
          </div>
          {#if ch.chartable !== false}
            <Sparkline values={rings[ch.key] ?? []} width={140} height={28} />
          {/if}
          {#if q && q !== "ok"}<div class="q status-offline">{q}</div>{/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .live { display: flex; flex-direction: column; gap: 0.75rem; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; }
  .head h3 { margin: 0; font-size: 1rem; font-family: ui-monospace, monospace; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }
  .cell {
    background: #141a21;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  .ch-label { color: #9aa4b1; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .ch-value { display: flex; align-items: baseline; gap: 0.25rem; }
  .num { font-size: 1.6rem; font-variant-numeric: tabular-nums; font-weight: 600; }
  .unit { color: #9aa4b1; font-size: 0.85rem; }
  .q { font-size: 0.75rem; }
  .muted { color: #888; }
</style>
