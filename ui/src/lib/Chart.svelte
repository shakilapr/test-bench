<script lang="ts">
  // Interactive line chart with axes, grid, and hover crosshair/tooltip.
  // Designed for live telemetry: x is time (ms since epoch), y is a numeric channel.

  export let samples: { ts: number; v: number }[] = [];
  export let unit = "";
  export let label = "";
  export let color = "#4ea1ff";
  export let precision = 2;
  export let height = 300;

  const PAD = { top: 16, right: 12, bottom: 28, left: 56 };

  let containerW = 800;
  let hoverIdx: number | null = null;
  let hoverPx: { x: number; y: number } | null = null;
  let svgEl: SVGSVGElement;

  function format(v: number): string {
    if (!Number.isFinite(v)) return "—";
    return v.toFixed(precision);
  }

  function fmtRel(ts: number, now: number): string {
    const s = Math.round((ts - now) / 1000);
    if (s === 0) return "now";
    return `${s}s`;
  }

  // Compute scales + path. Re-runs reactively as inputs change.
  $: w = containerW;
  $: h = height;
  $: innerW = Math.max(50, w - PAD.left - PAD.right);
  $: innerH = Math.max(40, h - PAD.top - PAD.bottom);

  $: vs = samples.map((s) => s.v).filter((v) => Number.isFinite(v));
  $: tMin = samples.length ? samples[0].ts : 0;
  $: tMax = samples.length ? samples[samples.length - 1].ts : 1;
  $: tRange = Math.max(1, tMax - tMin);
  $: yMinRaw = vs.length ? Math.min(...vs) : 0;
  $: yMaxRaw = vs.length ? Math.max(...vs) : 1;
  $: ySpan = yMaxRaw - yMinRaw || Math.max(1, Math.abs(yMaxRaw) * 0.05);
  $: yPad = ySpan * 0.1;
  $: yMin = yMinRaw - yPad;
  $: yMax = yMaxRaw + yPad;

  $: stats = vs.length
    ? { min: Math.min(...vs), max: Math.max(...vs), last: vs[vs.length - 1] }
    : null;

  function xPx(ts: number, args: { tMin: number; tRange: number; innerW: number }) {
    return PAD.left + ((ts - args.tMin) / args.tRange) * args.innerW;
  }
  function yPx(v: number, args: { yMin: number; yMax: number; innerH: number }) {
    if (args.yMax === args.yMin) return PAD.top + args.innerH / 2;
    return PAD.top + (1 - (v - args.yMin) / (args.yMax - args.yMin)) * args.innerH;
  }

  $: scale = { tMin, tRange, innerW, yMin, yMax, innerH };

  $: path = (() => {
    if (samples.length < 2) return "";
    let d = "";
    for (let i = 0; i < samples.length; i++) {
      const x = xPx(samples[i].ts, scale).toFixed(1);
      const y = yPx(samples[i].v, scale).toFixed(1);
      d += (i === 0 ? "M" : "L") + x + "," + y + " ";
    }
    return d.trim();
  })();

  $: yTicks = (() => {
    if (yMax === yMin) return [yMin];
    const ticks: number[] = [];
    const n = 4;
    for (let i = 0; i <= n; i++) ticks.push(yMin + (i / n) * (yMax - yMin));
    return ticks;
  })();

  $: xTicks = samples.length
    ? [samples[0].ts, samples[Math.floor(samples.length / 2)].ts, samples[samples.length - 1].ts]
    : [];

  function onMove(ev: MouseEvent) {
    if (!svgEl || samples.length === 0) return;
    const r = svgEl.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * w;
    if (x < PAD.left || x > PAD.left + innerW) {
      hoverIdx = null;
      hoverPx = null;
      return;
    }
    // Map x back to ts then nearest sample by index.
    const ts = tMin + ((x - PAD.left) / innerW) * tRange;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].ts - ts);
      if (d < bestD) { bestD = d; best = i; }
    }
    hoverIdx = best;
    hoverPx = { x: xPx(samples[best].ts, scale), y: yPx(samples[best].v, scale) };
  }
  function onLeave() {
    hoverIdx = null;
    hoverPx = null;
  }

  $: hoverSample = hoverIdx !== null ? samples[hoverIdx] : null;
  $: tooltipLeft = hoverPx ? Math.min(Math.max(hoverPx.x + 10, PAD.left), w - 130) : 0;
  $: tooltipTop = hoverPx ? Math.max(PAD.top, hoverPx.y - 40) : 0;
</script>

<div class="chart" bind:clientWidth={containerW} data-testid="chart-{label}">
  <header class="stats">
    <span class="stat"><span class="k">Min</span><span class="v">{stats ? format(stats.min) : "—"}</span><span class="u">{unit}</span></span>
    <span class="stat"><span class="k">Max</span><span class="v">{stats ? format(stats.max) : "—"}</span><span class="u">{unit}</span></span>
    <span class="stat last"><span class="k">Last</span><span class="v">{stats ? format(stats.last) : "—"}</span><span class="u">{unit}</span></span>
    <span class="count">{samples.length} pts</span>
  </header>

  <svg
    bind:this={svgEl}
    width={w}
    height={h}
    viewBox="0 0 {w} {h}"
    on:mousemove={onMove}
    on:mouseleave={onLeave}
    role="img"
    aria-label="{label} chart"
  >
    <!-- y grid + labels -->
    {#each yTicks as t}
      <line x1={PAD.left} x2={PAD.left + innerW} y1={yPx(t, scale)} y2={yPx(t, scale)} class="grid" />
      <text x={PAD.left - 6} y={yPx(t, scale) + 4} class="ylabel">{format(t)}</text>
    {/each}

    <!-- axes -->
    <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} class="axis" />
    <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + innerH} class="axis" />

    <!-- x labels -->
    {#each xTicks as t, i}
      {@const cx = xPx(t, scale)}
      <text x={cx} y={h - 10} class="xlabel" text-anchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>
        {fmtRel(t, tMax)}
      </text>
    {/each}

    <!-- y axis unit -->
    {#if unit}
      <text x={10} y={PAD.top + innerH / 2} class="yunit" transform="rotate(-90 10 {PAD.top + innerH / 2})" text-anchor="middle">{unit}</text>
    {/if}

    <!-- series -->
    {#if path}
      <path d={path} fill="none" stroke={color} stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
    {:else if samples.length === 1}
      <circle cx={xPx(samples[0].ts, scale)} cy={yPx(samples[0].v, scale)} r="2.5" fill={color} />
    {/if}

    <!-- hover crosshair -->
    {#if hoverPx && hoverSample}
      <line x1={hoverPx.x} x2={hoverPx.x} y1={PAD.top} y2={PAD.top + innerH} class="cross" />
      <circle cx={hoverPx.x} cy={hoverPx.y} r="3.5" fill={color} stroke="#0e1217" stroke-width="1" />
    {/if}
  </svg>

  {#if hoverPx && hoverSample}
    <div class="tooltip" style="left: {tooltipLeft}px; top: {tooltipTop}px" data-testid="chart-tooltip-{label}">
      <div class="tt-v">{format(hoverSample.v)} <span class="tt-u">{unit}</span></div>
      <div class="tt-t">{fmtRel(hoverSample.ts, tMax)}</div>
    </div>
  {/if}

  {#if samples.length === 0}
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
    align-items: baseline;
    gap: 1.25rem;
    flex-wrap: wrap;
    padding: 0.25rem 0 0.5rem;
    font-size: 0.85rem;
  }
  .stat { display: inline-flex; align-items: baseline; gap: 0.3rem; }
  .stat .k { color: #6c7785; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .v { font-variant-numeric: tabular-nums; font-weight: 600; color: #e6e9ef; }
  .stat .u { color: #9aa4b1; font-size: 0.75rem; }
  .stat.last .v { color: #4ea1ff; }
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
    line-height: 1.2;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .tt-v { font-variant-numeric: tabular-nums; font-weight: 600; }
  .tt-u { color: #9aa4b1; font-weight: 400; font-size: 0.7rem; }
  .tt-t { color: #6c7785; font-size: 0.7rem; font-family: ui-monospace, monospace; }
  .empty {
    position: absolute;
    inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: #6c7785; pointer-events: none;
  }
</style>
