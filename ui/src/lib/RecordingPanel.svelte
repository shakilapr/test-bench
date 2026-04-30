<script lang="ts">
  import type { DeviceDto } from "./stores.js";
  import { recordings, activeRecording, refreshRecordings, deleteRecording } from "./stores.js";

  import { onDestroy } from "svelte";

  export let device: DeviceDto;
  let label = "";
  let busy = false;
  let err = "";
  let now = Date.now();

  // Tick every second so the elapsed-time display updates.
  const ticker = setInterval(() => { now = Date.now(); }, 1000);
  onDestroy(() => clearInterval(ticker));

  $: history = $recordings[device.device_id] ?? [];
  $: active = $activeRecording[device.device_id] ?? null;
  $: if (device) refreshRecordings(device.device_id);

  async function start() {
    busy = true; err = "";
    try {
      const r = await fetch(`/api/devices/${device.device_id}/recordings/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!r.ok) err = (await r.json()).error ?? `HTTP ${r.status}`;
      label = "";
      await refreshRecordings(device.device_id);
    } finally { busy = false; }
  }

  async function stop() {
    busy = true; err = "";
    try {
      const r = await fetch(`/api/devices/${device.device_id}/recordings/stop`, { method: "POST" });
      if (!r.ok) err = (await r.json()).error ?? `HTTP ${r.status}`;
      await refreshRecordings(device.device_id);
    } finally { busy = false; }
  }

  function fmtDuration(start: number, end: number | null): string {
    const ms = (end ?? Date.now()) - start;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
</script>

<section class="card">
  <header class="head">
    <h3>Recordings</h3>
    {#if active}
      <button
        class="icon-btn danger"
        on:click={stop}
        disabled={busy}
        data-testid="stop-rec-btn"
        title="Stop recording"
        aria-label="Stop recording"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" fill="currentColor" />
        </svg>
      </button>
    {:else}
      <div class="start">
        <input bind:value={label} placeholder="label (optional)" data-testid="rec-label" />
        <button
          class="icon-btn record"
          on:click={start}
          disabled={busy}
          data-testid="start-rec-btn"
          title="Start recording"
          aria-label="Start recording"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="6" fill="currentColor" />
          </svg>
        </button>
      </div>
    {/if}
  </header>
  {#if err}<p class="status-offline" data-testid="rec-error">{err}</p>{/if}
  {#if active}
    <p class="active-line" data-testid="rec-active">
      Recording <code>{active.recording_id}</code>
      {#if active.label}— <em>{active.label}</em>{/if}
      · {fmtDuration(active.started_at, now)}
    </p>
  {/if}

  {#if history.length === 0}
    <p class="muted">No recordings yet.</p>
  {:else}
    <table class="hist" data-testid="rec-history">
      <thead><tr><th>ID</th><th>Label</th><th>Started</th><th>Duration</th><th>Samples</th><th></th></tr></thead>
      <tbody>
        {#each history as h (h.recording_id)}
          <tr>
            <td><code>{h.recording_id.slice(0, 12)}…</code></td>
            <td>{h.label ?? ""}</td>
            <td>{new Date(h.started_at).toLocaleTimeString()}</td>
            <td>{fmtDuration(h.started_at, h.ended_at)}</td>
            <td>{h.sample_count ?? 0}</td>
            <td class="actions">
              {#if h.ended_at}
                <a
                  class="export-btn"
                  href="/api/recordings/{h.recording_id}/export.csv"
                  download
                  data-testid="export-csv-{h.recording_id}"
                >CSV</a>
                <button
                  class="del-btn"
                  on:click={() => deleteRecording(h.recording_id, device.device_id)}
                  data-testid="delete-rec-{h.recording_id}"
                  title="Delete recording"
                >✕</button>
              {:else}
                <span class="muted">live</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
  .head h3 { margin: 0; font-size: 1rem; }
  .start { display: flex; gap: 0.5rem; }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; padding: 0; border-radius: 4px;
    cursor: pointer;
  }
  .icon-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
  .icon-btn.record { background: transparent; border: 1px solid var(--err); color: var(--err); }
  .icon-btn.record:hover { background: #2a1818; }
  .icon-btn.danger { background: #5c1f1f; border-color: var(--err); color: #fff; }
  .active-line { background: #1f2a3a; padding: 0.5rem 0.75rem; border-radius: 4px; }
  .hist { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .hist th, .hist td { padding: 0.4rem 0.5rem; text-align: left; border-bottom: 1px solid #222; }
  .hist th { color: #9aa4b1; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
  .export-btn {
    color: var(--accent); text-decoration: none; padding: 0.2rem 0.5rem;
    border: 1px solid #2a3a4f; border-radius: 4px; font-size: 0.8rem;
  }
  .export-btn:hover { border-color: var(--accent); background: #182230; }
  .actions { display: flex; gap: 0.35rem; align-items: center; }
  .del-btn {
    background: transparent; border: 1px solid #3a2a2a; color: #c47a7a;
    padding: 0.15rem 0.4rem; font-size: 0.75rem; border-radius: 4px; cursor: pointer;
  }
  .del-btn:hover { border-color: var(--err); color: var(--err); background: #2a1818; }
  .muted { color: #888; }
</style>
