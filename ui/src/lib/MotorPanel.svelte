<script lang="ts">
  import type { DeviceDto, Reading, Sample } from "./stores.js";
  import {
    recentSamples, chartWindow, WINDOWS, windowMsFor,
    filterByWindow, resetSamples,
  } from "./stores.js";
  import Chart from "./Chart.svelte";

  export let device: DeviceDto;
  export let reading: Reading | undefined;

  const KEY = "motor_rpm";
  const COLOR = "#4ec96b";

  $: meta = device.metadata;
  $: channel = (meta?.channels ?? []).find((c) => c.key === KEY);
  $: precision = channel?.precision ?? 0;
  $: unit = channel?.unit ?? "rpm";
  $: label = channel?.label ?? "Motor speed";

  $: rpm = reading?.readings?.[KEY];
  $: q = reading?.quality?.[KEY];
  $: qLabel = q !== undefined && q !== 0
    ? (meta?.quality_codes?.[KEY]?.[String(q)] ?? "fault")
    : "";

  $: allSamples = ($recentSamples[device.device_id] ?? []) as Sample[];
  $: windowMs = windowMsFor($chartWindow);
  $: visibleSamples = filterByWindow(allSamples, windowMs, Date.now());
  $: chartSamples = visibleSamples
    .map((s) => ({ ts: s.ts, v: s.readings[KEY] }))
    .filter((p) => Number.isFinite(p.v));

  function format(v: number | undefined): string {
    if (v === undefined || !Number.isFinite(v)) return "—";
    return v.toFixed(precision);
  }
  function onReset() { resetSamples(device.device_id); }
</script>

<section class="panel" data-testid="motor-panel-{device.device_id}">
  {#if !channel}
    <p class="muted">This device does not report <code>{KEY}</code>.</p>
  {:else}
    <div class="hero" style="--accent: {COLOR}">
      <div class="hlabel">{label}</div>
      <div class="hvalue">
        <span class="num" data-testid="motor-rpm">{format(rpm)}</span>
        <span class="unit">{unit}</span>
      </div>
      {#if qLabel}<div class="hq status-offline">{qLabel}</div>{/if}
    </div>

    <div class="chart-toolbar">
      <span class="muted">Live chart</span>
      <div class="settings">
        <label class="window">
          <span class="wlbl">Window</span>
          <select bind:value={$chartWindow} data-testid="motor-chart-window">
            {#each WINDOWS as w}<option value={w.label}>{w.label}</option>{/each}
          </select>
        </label>
        <button
          class="reset"
          on:click={onReset}
          disabled={allSamples.length === 0}
          title="Clear retained samples"
        >Reset</button>
      </div>
    </div>

    <Chart
      samples={chartSamples}
      unit={unit}
      label={KEY}
      color={COLOR}
      precision={precision}
      height={360}
    />
  {/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 0.75rem; }
  .hero {
    background: #141a21;
    border-left: 4px solid var(--accent, #4ec96b);
    border-radius: 4px;
    padding: 1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .hlabel { color: #9aa4b1; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .hvalue { display: flex; align-items: baseline; gap: 0.4rem; }
  .num { font-size: 3.2rem; font-variant-numeric: tabular-nums; font-weight: 700; }
  .unit { color: #9aa4b1; font-size: 1rem; }
  .hq { font-size: 0.8rem; }
  .muted { color: #6c7785; }
  .chart-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; border-bottom: 1px solid #1c232c;
    padding: 0 0.25rem; flex-wrap: wrap;
  }
  .settings { display: flex; align-items: center; gap: 0.6rem; padding-bottom: 0.4rem; }
  .window { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #9aa4b1; }
  .wlbl { text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.7rem; }
  .window select {
    background: #141a21; color: #e6e9ef; border: 1px solid #2a3340;
    padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .reset {
    background: transparent; color: #9aa4b1; border: 1px solid #2a3340;
    padding: 0.25rem 0.7rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer;
  }
  .reset:hover:not(:disabled) { color: #e6e9ef; border-color: #4a5566; }
  .reset:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
