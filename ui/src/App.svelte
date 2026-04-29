<script lang="ts">
  import { onMount } from "svelte";
  import {
    devices, selectedDeviceId, selectedDevice, liveReadings, grafanaUrl, wsConnected,
    refreshDevices, refreshGrafanaUrl,
  } from "./lib/stores.js";
  import { WsClient } from "./lib/ws.js";
  import LiveCard from "./lib/LiveCard.svelte";
  import CommandPanel from "./lib/CommandPanel.svelte";
  import RecordingPanel from "./lib/RecordingPanel.svelte";
  import GrafanaPanel from "./lib/GrafanaPanel.svelte";

  let ws: WsClient | null = null;

  onMount(() => {
    refreshDevices();
    refreshGrafanaUrl();
    ws = new WsClient();
    ws.start();
    return () => ws?.stop();
  });
</script>

<header style="padding:0.75rem 1rem;border-bottom:1px solid #222;display:flex;align-items:center;gap:1rem">
  <h1 style="margin:0;font-size:1.1rem">Bench</h1>
  <span style="color:{$wsConnected ? 'var(--ok)' : 'var(--err)'}" data-testid="ws-status">
    {$wsConnected ? "● live" : "○ offline"}
  </span>
  <select bind:value={$selectedDeviceId} data-testid="device-select">
    {#each $devices as d}<option value={d.device_id}>{d.device_id}</option>{/each}
  </select>
</header>

<main style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:1rem">
  {#if $selectedDevice}
    <div>
      <LiveCard device={$selectedDevice} reading={$liveReadings[$selectedDevice.device_id]} />
      <CommandPanel device={$selectedDevice} />
      <RecordingPanel device={$selectedDevice} />
    </div>
    <div>
      <GrafanaPanel url={$grafanaUrl} deviceId={$selectedDevice.device_id} />
    </div>
  {:else}
    <p style="grid-column:1/-1;color:#888">No devices yet. Bring one online.</p>
  {/if}
</main>
