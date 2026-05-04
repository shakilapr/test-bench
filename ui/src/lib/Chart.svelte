<script lang="ts">
  // Multi-series interactive line chart.
  //
  // Each series is auto-scaled to its own y-range so channels with very
  // different magnitudes (e.g. current_a ≈ 0–20 and motor_rpm ≈ 0–6000) can be
  // overlaid in the same plot for shape comparison. The header lists per-series
  // min/max/last in the channel's native units; the y-axis is suppressed when
  // more than one series is shown because a shared axis would be misleading.

  export interface Series {
    key: string;
    label: string;
    unit: string;
    color: string;
    precision?: number;
    samples: { ts: number; v: number }[];
  }

  export let series: Series[] = [];
  export let height = 300;

  const PAD = { top: 16, right: 12, bottom: 28, left: 56 };

  let containerW = 800;
  let hoverIdx: number | null = null;
  let hoverPxX: number | null = null;
  let svgEl: SVGSVGElement;

  function format(v: number, p = 2): string {
    if (!Number.isFinite(v)) return "—";
    return v.toFixed(p);
  }
  function fmtRel(ts: number, now: number): string {
    const s = Math.round((ts - now) / 1000);
    if (s === 0) return "now";
    return `${s}s`;
  }

  $: w = containerW;
  $: h = height;
  $: innerW = Math.max(50, w - PAD.left - PAD.right);
  $: innerH = Math.max(40, h - PAD.top - PAD.bottom);

  // Use the longest series to drive the time axis so all series share x.
  $: tsRefSamples = series.reduce(
    (best, s) => (s.samples.length > best.length ? s.samples : best),
    [] as { ts: number; v: number }[],
  );
  $: tMin = tsRefSamples.length ? tsRefSamples[0].ts : 0;
  $: tMax = tsRefSamples.length ? tsRefSamples[tsRefSamples.length - 1].ts : 1;
  $: tRange = Math.max(1, tMax - tMin);

  $: multi = series.length > 1;
  $: primary = series[0] ?? null;

  // Per-series y-range. Independent auto-scale; the path coordinates use this.
  function yRangeOf(s: Series): { min: number; max: number } {
    const vs = s.samples.map((p) => p.v).filter((v) => Number.isFinite(v));
    if (vs.length === 0) return { min: 0, max: 1 };
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const span = hi - lo || Math.max(1, Math.abs(hi) * 0.05);
    const pad = span * 0.1;
    return { min: lo - pad, max: hi + pad };
  }
  $: ranges = series.map(yRangeOf);

  function xPx(ts: number): number {
    return PAD.left + ((ts - tMin) / tRange) * innerW;
  }
  function yPx(v: number, range: { min: number; max: number }): number {
    if (range.max === range.min) return PAD.top + innerH / 2;
    return PAD.top + (1 - (v - range.min) / (range.max - range.min)) * innerH;
  }

  function pathFor(s: Series, range: { min: number; max: number }): string {
    if (s.samples.length < 2) return "";
    let d = "";
    for (let i = 0; i < s.samples.length; i++) {
      const x = xPx(s.samples[i].ts).toFixed(1);
      const y = yPx(s.samples[i].v, range).toFixed(1);
      d += (i === 0 ? "M" : "L") + x + "," + y + " ";
    }
    return d.trim();
  }
  $: paths = series.map((s, i) => pathFor(s, ranges[i]));

  // Y-axis ticks only meaningful in single-series mode.
  $: yTicks = !multi && primary
    ? (() => {
        const r = ranges[0];
        if (r.max === r.min) return [r.min];
        const t: number[] = [];
        const n = 4;
        for (let i = 0; i <= n; i++) t.push(r.min + (i / n) * (r.max - r.min));
        return t;
      })()
    : [];

  $: xTicks = tsRefSamples.length
    ? [
        tsRefSamples[0].ts,
        tsRefSamples[Math.floor(tsRefSamples.length / 2)].ts,
        tsRefSamples[tsRefSamples.length - 1].ts,
      ]
    : [];

  function statsOf(s: Series): { min: number; max: number; last: number } | null {
    const vs = s.samples.map((p) => p.v).filter((v) => Number.isFinite(v));
    if (vs.length === 0) return null;
    return { min: Math.min(...vs), max: Math.max(...vs), last: vs[vs.length - 1] };
  }

  function onMove(ev: MouseEvent) {
    if (!svgEl || tsRefSamples.length === 0) return;
    const r = svgEl.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * w;
    if (x < PAD.left || x > PAD.left + innerW) {
      hoverIdx = null;
      hoverPxX = null;
      return;
    }
    const ts = tMin + ((x - PAD.left) / innerW) * tRange;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < tsRefSamples.length; i++) {
      const d = Math.abs(tsRefSamples[i].ts - ts);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    hoverIdx = best;
    hoverPxX = xPx(tsRefSamples[best].ts);
  }
  function onLeave() {
    hoverIdx = null;
    hoverPxX = null;
  }

  // For each series, find the sample whose ts is nearest the reference ts
  // at hoverIdx. Series are derived from the same window so indices usually
  // align, but we re-scan to be robust.
  function nearestSample(s: Series, refTs: number): { ts: number; v: number } | null {
    if (s.samples.length === 0) return null;
    let best = s.samples[0];
    let bestD = Math.abs(best.ts - refTs);
    for (let i = 1; i < s.samples.length; i++) {
      const d = Math.abs(s.samples[i].ts - refTs);
      if (d < bestD) {
        bestD = d;
        best = s.samples[i];
      }
    }
    return best;
  }

  $: hoverTs = hoverIdx !== null ? tsRefSamples[hoverIdx].ts : null;
  $: hoverPoints =
    hoverTs !== null
      ? series.map((s, i) => {
          const sample = nearestSample(s, hoverTs!);
          return sample ? { series: s, range: ranges[i], sample } : null;
        })
      : [];
  $: tooltipLeft =
    hoverPxX !== null ? Math.min(Math.max(hoverPxX + 10, PAD.left), w - 160) : 0;
  $: tooltipTop = PAD.top + 4;

  $: chartTestId = series.length === 0
    ? "empty"
    : series.length === 1
      ? series[0].key
      : series.map((s) => s.key).join("+");
</script>

<div class="chart" bind:clientWidth={containerW} data-testid="chart-{chartTestId}">
  <header class="stats">
    {#each series as s}
      {@const st = statsOf(s)}
      <span class="legend-row" style="--accent: {s.color}" data-testid="chart-stats-{s.key}">
        <span class="dot"></span>
        <span class="lbl">{s.label}</span>
        <span class="stat"><span class="k">Min</span><span class="v">{st ? format(st.min, s.precision ?? 2) : "—"}</span></span>
        <span class="stat"><span class="k">Max</span><span class="v">{st ? format(st.max, s.precision ?? 2) : "—"}</span></span>
        <span class="stat last"><span class="k">Last</span><span class="v">{st ? format(st.last, s.precision ?? 2) : "—"}</span></span>
        <span class="u">{s.unit}</span>
      </span>
    {/each}
    <span class="count">{tsRefSamples.length} pts</span>
  </header>

  <svg
    bind:this={svgEl}
    width={w}
    height={h}
    viewBox="0 0 {w} {h}"
    on:mousemove={onMove}
    on:mouseleave={onLeave}
    role="img"
    aria-label="chart"
  >
    <!-- y grid + labels (single-series only; ambiguous when overlaying) -->
    {#each yTicks as t}
      <line x1={PAD.left} x2={PAD.left + innerW} y1={yPx(t, ranges[0])} y2={yPx(t, ranges[0])} class="grid" />
      <text x={PAD.left - 6} y={yPx(t, ranges[0]) + 4} class="ylabel">{format(t, primary?.precision ?? 2)}</text>
    {/each}
    {#if multi}
      <!-- minimal grid lines without labels -->
      {#each [0.25, 0.5, 0.75] as f}
        <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + f * innerH} y2={PAD.top + f * innerH} class="grid" />
      {/each}
    {/if}

    <!-- axes -->
    <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} class="axis" />
    <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + innerH} class="axis" />

    <!-- x labels -->
    {#each xTicks as t, i}
      {@const cx = xPx(t)}
      <text x={cx} y={h - 10} class="xlabel" text-anchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>
        {fmtRel(t, tMax)}
      </text>
    {/each}

    <!-- y axis unit (single-series only) -->
    {#if !multi && primary?.unit}
      <text x={10} y={PAD.top + innerH / 2} class="yunit" transform="rotate(-90 10 {PAD.top + innerH / 2})" text-anchor="middle">{primary.unit}</text>
    {/if}

    <!-- series paths -->
    {#each series as s, i}
      {#if paths[i]}
        <path d={paths[i]} fill="none" stroke={s.color} stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
      {:else if s.samples.length === 1}
        <circle cx={xPx(s.samples[0].ts)} cy={yPx(s.samples[0].v, ranges[i])} r="2.5" fill={s.color} />
      {/if}
    {/each}

    <!-- hover crosshair + per-series dots -->
    {#if hoverPxX !== null}
      <line x1={hoverPxX} x2={hoverPxX} y1={PAD.top} y2={PAD.top + innerH} class="cross" />
      {#each hoverPoints as hp}
        {#if hp}
          <circle
            cx={xPx(hp.sample.ts)}
            cy={yPx(hp.sample.v, hp.range)}
            r="3.5"
            fill={hp.series.color}
            stroke="#0e1217"
            stroke-width="1"
          />
        {/if}
      {/each}
    {/if}
  </svg>

  {#if hoverPxX !== null && hoverTs !== null}
    <div class="tooltip" style="left: {tooltipLeft}px; top: {tooltipTop}px" data-testid="chart-tooltip">
      <div class="tt-t">{fmtRel(hoverTs, tMax)}</div>
      {#each hoverPoints as hp}
        {#if hp}
          <div class="tt-row" style="--accent: {hp.series.color}">
            <span class="tt-dot"></span>
            <span class="tt-v">{format(hp.sample.v, hp.series.precision ?? 2)}</span>
            <span class="tt-u">{hp.series.unit}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if tsRefSamples.length === 0}
    <div class="empty">Waiting for telemetry…</div>
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
    background: #0e1217;
    border: 1px solid #1c232c;
    border-radius: 6px;
    padding: 0.5rem 0.75rem 0.25rem;
  }
  .stats {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.25rem 0 0.5rem;
    font-size: 0.8rem;
  }
  .legend-row { display: inline-flex; align-items: baseline; gap: 0.45rem; }
  .legend-row .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent, #4ea1ff);
    align-self: center;
  }
  .legend-row .lbl { color: #e6e9ef; font-size: 0.78rem; }
  .stat { display: inline-flex; align-items: baseline; gap: 0.25rem; }
  .stat .k { color: #6c7785; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .v { font-variant-numeric: tabular-nums; font-weight: 600; color: #e6e9ef; }
  .stat.last .v { color: var(--accent, #4ea1ff); }
  .legend-row .u { color: #9aa4b1; font-size: 0.72rem; }
  .count { margin-left: auto; color: #6c7785; font-size: 0.75rem; }
  svg { display: block; width: 100%; height: auto; }
  .grid { stroke: #1c232c; stroke-width: 1; }
  .axis { stroke: #2a3340; stroke-width: 1; }
  .ylabel { fill: #6c7785; font-size: 10px; text-anchor: end; font-family: ui-monospace, monospace; }
  .xlabel { fill: #6c7785; font-size: 10px; font-family: ui-monospace, monospace; }
  .yunit { fill: #6c7785; font-size: 10px; }
  .cross { stroke: #4ea1ff; stroke-dasharray: 2 3; stroke-width: 1; opacity: 0.7; }
  .tooltip {
    position: absolute;
    background: #1a1f26;
    border: 1px solid #2a3340;
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    pointer-events: none;
    font-size: 0.8rem;
    line-height: 1.3;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    min-width: 8rem;
  }
  .tt-t { color: #6c7785; font-size: 0.7rem; font-family: ui-monospace, monospace; margin-bottom: 0.15rem; }
  .tt-row { display: flex; align-items: baseline; gap: 0.35rem; }
  .tt-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #4ea1ff); align-self: center; }
  .tt-v { font-variant-numeric: tabular-nums; font-weight: 600; }
  .tt-u { color: #9aa4b1; font-weight: 400; font-size: 0.72rem; }
  .empty {
    position: absolute;
    inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: #6c7785; pointer-events: none;
  }
</style>
