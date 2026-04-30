<script lang="ts">
  import { onMount } from "svelte";
  import {
    devices, selectedDeviceId, selectedDevice, liveReadings, wsConnected,
    activeRecording, refreshDevices,
  } from "./lib/stores.js";
  import { WsClient } from "./lib/ws.js";
  import DeviceList from "./lib/DeviceList.svelte";
  import LivePanel from "./lib/LivePanel.svelte";
  import CommandPanel from "./lib/CommandPanel.svelte";
  import RecordingPanel from "./lib/RecordingPanel.svelte";
  import SimButton from "./lib/SimButton.svelte";

  let ws: WsClient | null = null;

  onMount(() => {
    refreshDevices();
    ws = new WsClient();
    ws.start();
    return () => ws?.stop();
  });

  $: dev = $selectedDevice;
  $: active = dev ? $activeRecording[dev.device_id] : null;
</script>

<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <h1>Bench</h1>
      <span class="ws-{$wsConnected ? 'on' : 'off'}" data-testid="ws-status">
        {$wsConnected ? "● live" : "○ offline"}
      </span>
    </div>
    <DeviceList items={$devices} />
    <div class="sim-slot"><SimButton /></div>
  </aside>

  <header class="topbar">
    {#if dev}
      <div class="cur">
        <span class="cur-label">Device</span>
        <strong data-testid="current-device">{dev.device_id}</strong>
        <span class="status-{dev.last_status}">● {dev.last_status}</span>
      </div>
      {#if active}
        <span class="rec-badge" data-testid="header-rec-active">
          ● REC <code>{active.recording_id.slice(0, 10)}…</code>
        </span>
      {/if}
    {:else}
      <span class="muted">Select a device</span>
    {/if}
  </header>

  <main class="main">
    {#if dev}
      <LivePanel device={dev} reading={$liveReadings[dev.device_id]} />
      <div class="row">
        <CommandPanel device={dev} />
        <RecordingPanel device={dev} />
      </div>
    {:else}
      <p class="muted">No device selected. Bring one online or pick from the sidebar.</p>
    {/if}
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    grid-template-rows: 56px minmax(0, 1fr);
    grid-template-areas: "sidebar topbar" "sidebar main";
    height: 100vh;
    min-width: 0;
  }
  .sidebar {
    grid-area: sidebar;
    background: #0e1217;
    border-right: 1px solid #222;
    overflow-y: auto;
    min-width: 0;
  }
  .brand {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1rem; border-bottom: 1px solid #222;
  }
  .brand h1 { margin: 0; font-size: 1.1rem; letter-spacing: 0.05em; }
  .ws-on { color: var(--ok); font-size: 0.85rem; }
  .ws-off { color: var(--err); font-size: 0.85rem; }
  .topbar {
    grid-area: topbar;
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 1rem; border-bottom: 1px solid #222; background: #0e1217;
    gap: 1rem;
    min-width: 0;
  }
  .cur { display: flex; align-items: center; gap: 0.75rem; min-width: 0; flex-shrink: 1; overflow: hidden; }
  .cur strong { font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; }
  .cur-label { color: #9aa4b1; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; }
  .rec-badge {
    color: var(--err); font-size: 0.85rem; font-weight: 600;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
  .main {
    grid-area: main;
    overflow-y: auto;
    padding: 1rem;
    display: flex; flex-direction: column; gap: 1rem;
    min-width: 0;
  }
  .main .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 980px) {
    .app { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; grid-template-areas: "sidebar" "topbar" "main"; height: auto; }
    .sidebar { max-height: 30vh; }
    .main .row { grid-template-columns: 1fr; }
  }
  .muted { color: #888; }
  .sim-slot {
    padding: 0.75rem 1rem;
    border-top: 1px solid #222;
  }
</style>
