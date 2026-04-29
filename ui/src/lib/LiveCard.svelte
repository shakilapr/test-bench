<script lang="ts">
  import type { DeviceDto, Reading } from "./stores.js";
  export let device: DeviceDto;
  export let reading: Reading | undefined;

  $: meta = device.metadata;
  $: channels = (meta?.channels ?? []) as Array<{ key: string; label: string; unit: string; precision?: number }>;

  function format(v: number, precision = 2): string {
    return v.toFixed(precision);
  }

  function qualityLabel(channelKey: string, code: number | undefined): string {
    if (code === undefined) return "";
    const codes = meta?.quality_codes?.[channelKey];
    return codes?.[String(code)] ?? "";
  }
</script>

<section class="card" data-testid="live-card-{device.device_id}">
  <header style="display:flex;justify-content:space-between;align-items:center;">
    <h3 style="margin:0">{device.device_id}</h3>
    <span class="status-{device.last_status}">{device.last_status}</span>
  </header>
  {#if !reading}
    <p style="color:#888">Waiting for telemetry...</p>
  {:else}
    <table style="width:100%;border-collapse:collapse;margin-top:0.5rem">
      <tbody>
        {#each channels as ch}
          {@const v = reading.readings[ch.key]}
          {@const q = qualityLabel(ch.key, reading.quality?.[ch.key])}
          <tr>
            <td style="padding:0.3rem 0;color:#888">{ch.label}</td>
            <td style="padding:0.3rem 0;text-align:right">
              {v === undefined ? "—" : format(v, ch.precision ?? 2)} <small>{ch.unit}</small>
              {#if q && q !== "ok"}<span class="status-offline" style="margin-left:0.5rem">{q}</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
