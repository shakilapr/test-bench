<script lang="ts">
  import type { DeviceDto, Reading, Sample } from "./stores.js";
  import {
    recentSamples, chartWindow, WINDOWS, windowMsFor,
    filterByWindow, resetSamples,
  } from "./stores.js";
  import Chart from "./Chart.svelte";

  export let device: DeviceDto;
  export let reading: Reading | undefined;

  interface Channel {
    key: string;
    label: string;
    unit: string;
    precision?: number;
    chartable?: boolean;
  }

  const COLORS = ["#4ea1ff", "#e6b34a", "#4ec96b", "#ee5e5e", "#b06bff", "#5ed4d4"];

  $: meta = device.metadata;
  $: channels = ((meta?.channels ?? []) as Channel[]);
  $: chartable = channels.filter((c) => c.chartable !== false);
  $: allSamples = ($recentSamples[device.device_id] ?? []) as Sample[];
  $: windowMs = windowMsFor($chartWindow);
  // Re-evaluate window slice as samples or window change. Date.now() drifts
  // per-render which is fine for the chart's purposes (~tab refresh rate).
  $: visibleSamples = filterByWindow(allSamples, windowMs, Date.now());
  $: activeKey = chartable[0]?.key ?? null;

  let selectedKey: string | null = null;
  $: tabKey = selectedKey && chartable.some((c) => c.key === selectedKey) ? selectedKey : activeKey;
  $: activeChannel = chartable.find((c) => c.key === tabKey) ?? null;
  $: chartSamples = activeChannel
    ? visibleSamples
        .map((s) => ({ ts: s.ts, v: s.readings[activeChannel!.key] }))
        .filter((p) => Number.isFinite(p.v))
    : [];

  function format(v: number | undefined, p = 2): string {
    if (v === undefined || !Number.isFinite(v)) return "—";
    return v.toFixed(p);
  }
  function qualityLabel(channelKey: string, code: number | undefined): string {
    if (code === undefined) return "";
    const codes = meta?.quality_codes?.[channelKey];
    return codes?.[String(code)] ?? "";
  }
  function colorFor(key: string): string {
    const i = chartable.findIndex((c) => c.key === key);
    return COLORS[i >= 0 ? i % COLORS.length : 0];
  }
  function onReset() {
    resetSamples(device.device_id);
  }
</script>

<section class="panel" data-testid="live-panel-{device.device_id}">
  <div class="tiles">
    {#each channels as ch}
      {@const v = reading?.readings[ch.key]}
      {@const q = qualityLabel(ch.key, reading?.quality?.[ch.key])}
      <div class="tile" data-testid="ch-{ch.key}" style="--accent: {colorFor(ch.key)}">
        <div class="tlabel">{ch.label}</div>
        <div class="tvalue">
          <span class="num">{format(v, ch.precision ?? 2)}</span>
          <span class="unit">{ch.unit}</span>
        </div>
        {#if q && q !== "ok"}<div class="tq status-offline">{q}</div>{/if}
      </div>
    {/each}
    <div class="meta">
      <span class="status-{device.last_status}">● {device.last_status}</span>
      <span class="muted">v{device.metadata_version} · {channels.length} ch</span>
    </div>
  </div>

  {#if chartable.length > 0}
    <div class="chart-toolbar">
      <div class="tabs" role="tablist" data-testid="chart-tabs">
        {#each chartable as ch}
          <button
            role="tab"
            aria-selected={tabKey === ch.key}
            class:active={tabKey === ch.key}
            on:click={() => selectedKey = ch.key}
            data-testid="tab-{ch.key}"
            style="--accent: {colorFor(ch.key)}"
          >
            <span class="dot"></span>{ch.label}
            <span class="ttu">{ch.unit}</span>
          </button>
        {/each}
      </div>
      <div class="settings">
        <label class="window">
          <span class="wlbl">Window</span>
          <select bind:value={$chartWindow} data-testid="chart-window">
            {#each WINDOWS as w}
              <option value={w.label}>{w.label}</option>
            {/each}
          </select>
        </label>
        <button
          class="reset"
          on:click={onReset}
          disabled={allSamples.length === 0}
          data-testid="chart-reset"
          title="Clear retained samples"
        >Reset</button>
      </div>
    </div>

    {#if activeChannel}
      <Chart
        samples={chartSamples}
        unit={activeChannel.unit}
        label={activeChannel.key}
        color={colorFor(activeChannel.key)}
        precision={activeChannel.precision ?? 2}
        height={320}
      />
    {/if}
  {/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 0.75rem; }
  .tiles {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: stretch;
  }
  .tile {
    flex: 1 1 200px;
    min-width: 180px;
    background: #141a21;
    border-left: 3px solid var(--accent, #4ea1ff);
    border-radius: 4px;
    padding: 0.6rem 0.9rem;
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .tlabel { color: #9aa4b1; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .tvalue { display: flex; align-items: baseline; gap: 0.3rem; }
  .num { font-size: 1.9rem; font-variant-numeric: tabular-nums; font-weight: 600; }
  .unit { color: #9aa4b1; font-size: 0.85rem; }
  .tq { font-size: 0.7rem; }
  .meta {
    align-self: stretch;
    display: flex; flex-direction: column; justify-content: center;
    gap: 0.25rem; font-size: 0.75rem; padding: 0 0.5rem;
  }
  .muted { color: #6c7785; }
  .chart-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; border-bottom: 1px solid #1c232c;
    padding: 0 0.25rem; flex-wrap: wrap;
  }
  .tabs { display: flex; gap: 0.25rem; }
  .tabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #9aa4b1;
    padding: 0.45rem 0.8rem;
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 0;
    display: inline-flex; align-items: center; gap: 0.4rem;
  }
  .tabs button .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent, #4ea1ff);
    display: inline-block;
  }
  .tabs button:hover { color: #e6e9ef; }
  .tabs button.active {
    color: #e6e9ef;
    border-bottom-color: var(--accent, #4ea1ff);
  }
  .ttu { color: #6c7785; font-size: 0.7rem; }
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
