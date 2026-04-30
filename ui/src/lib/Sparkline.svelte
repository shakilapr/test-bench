<script lang="ts">
  export let values: number[] = [];
  export let width = 120;
  export let height = 32;
  export let stroke = "#4ea1ff";

  $: path = buildPath(values, width, height);

  function buildPath(vs: number[], w: number, h: number): string {
    if (vs.length < 2) return "";
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const range = max - min || 1;
    const stepX = w / (vs.length - 1);
    let d = "";
    for (let i = 0; i < vs.length; i++) {
      const x = i * stepX;
      const y = h - ((vs[i] - min) / range) * h;
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
    }
    return d.trim();
  }
</script>

{#if path}
  <svg {width} {height} viewBox="0 0 {width} {height}" class="spark" aria-hidden="true">
    <path d={path} fill="none" {stroke} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
{:else}
  <span class="spark-empty" style="display:inline-block;width:{width}px;height:{height}px"></span>
{/if}

<style>
  .spark { display: block; }
</style>
