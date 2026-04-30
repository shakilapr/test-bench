<script lang="ts">
  import { onMount } from "svelte";
  import {
    devices, selectedDeviceId, selectedDevice, liveReadings, wsConnected,
    activeRecording, refreshDevices,
  } from "./lib/stores.js";
  import { WsClient } from "./lib/ws.js";
  import DeviceList from "./lib/DeviceList.svelte";
  import LivePanel from "./lib/LivePanel.svelte";
  import MotorPanel from "./lib/MotorPanel.svelte";
  import CommandPanel from "./lib/CommandPanel.svelte";
  import RecordingPanel from "./lib/RecordingPanel.svelte";

  let ws: WsClient | null = null;
  let view: "live" | "motor" = "live";

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
      <div class="view-tabs" role="tablist" data-testid="view-tabs">
        <button
          role="tab"
          aria-selected={view === "live"}
          class:active={view === "live"}
          on:click={() => (view = "live")}
          data-testid="view-tab-live"
        >Live</button>
        <button
          role="tab"
          aria-selected={view === "motor"}
          class:active={view === "motor"}
          on:click={() => (view = "motor")}
          data-testid="view-tab-motor"
        >Motor</button>
      </div>

      {#if view === "live"}
        <LivePanel device={dev} reading={$liveReadings[dev.device_id]} />
      {:else}
        <MotorPanel device={dev} reading={$liveReadings[dev.device_id]} />
      {/if}
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
  .view-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid #1c232c;
    margin-bottom: 0.25rem;
  }
  .view-tabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #9aa4b1;
    padding: 0.5rem 1rem;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 500;
  }
  .view-tabs button:hover { color: #e6e9ef; }
  .view-tabs button.active {
    color: #e6e9ef;
    border-bottom-color: #4ea1ff;
  }
</style>
